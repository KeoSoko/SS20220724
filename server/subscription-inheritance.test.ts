import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage module BEFORE importing the unit under test.
vi.mock('./storage', () => ({
  storage: {
    getUser: vi.fn(),
    getWorkspaceById: vi.fn(),
    getUserSubscription: vi.fn(),
  },
}));

import { storage } from './storage';
import { getEffectiveSubscriptionStatus } from './subscription-middleware';

const mockStorage = storage as unknown as {
  getUser: ReturnType<typeof vi.fn>;
  getWorkspaceById?: ReturnType<typeof vi.fn>;
  getUserSubscription: ReturnType<typeof vi.fn>;
};

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// Minimal data builders ---------------------------------------------------
const user = (id: number, workspaceId: number) => ({ id, workspaceId } as any);
const workspace = (id: number, ownerId: number) => ({ id, ownerId } as any);

const activeSub = () => ({ status: 'active', nextBillingDate: daysFromNow(20), paystackReference: 'ref_x' } as any);
const trialSub = () => ({ status: 'trial', trialEndDate: daysFromNow(10) } as any);
const expiredTrialSub = () => ({ status: 'trial', trialEndDate: daysFromNow(-1) } as any);
const cancelledGraceSub = () => ({ status: 'cancelled', nextBillingDate: daysFromNow(5), paystackReference: 'ref_x' } as any);
const cancelledExpiredSub = () => ({ status: 'cancelled', nextBillingDate: daysFromNow(-5) } as any);

beforeEach(() => {
  vi.clearAllMocks();
  // Re-attach getWorkspaceById in case a test deleted it.
  mockStorage.getWorkspaceById = vi.fn();
});

describe('getEffectiveSubscriptionStatus', () => {
  it('owner: returns their own ACTIVE subscription', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) => (id === 1 ? user(1, 100) : undefined));
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockResolvedValue(activeSub());

    const result = await getEffectiveSubscriptionStatus(1);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.subscriptionType).toBe('premium');
  });

  it('member: inherits owner ACTIVE subscription', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) => (id === 1 ? activeSub() : undefined));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.subscriptionType).toBe('premium');
    // Owner's subscription is queried, NOT the member's.
    expect(mockStorage.getUserSubscription).toHaveBeenCalledWith(1);
    expect(mockStorage.getUserSubscription).not.toHaveBeenCalledWith(2);
  });

  it('member: inherits owner TRIAL subscription', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) => (id === 1 ? trialSub() : undefined));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.isInTrial).toBe(true);
    expect(result.subscriptionType).toBe('trial');
  });

  it('member: inherits owner EXPIRED trial → no access', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) => (id === 1 ? expiredTrialSub() : undefined));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(false);
    expect(result.subscriptionType).toBe('none');
  });

  it('member: inherits owner CANCELLED-in-grace → still active', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) => (id === 1 ? cancelledGraceSub() : undefined));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.subscriptionType).toBe('premium');
  });

  it('member: owner cancelled AND grace expired → no access', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) => (id === 1 ? cancelledExpiredSub() : undefined));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(false);
    expect(result.subscriptionType).toBe('none');
  });

  it('FAILS CLOSED + logs CRITICAL when workspace owner record is missing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Member exists, workspace exists, but owner user record is gone (orphaned FK).
    mockStorage.getUser.mockImplementation(async (id: number) => (id === 2 ? user(2, 100) : undefined));
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 999));

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(false);
    expect(result.subscriptionType).toBe('none');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL_WORKSPACE_OWNER_MISSING]'));
    // Must NOT silently fall back to the member's own subscription.
    expect(mockStorage.getUserSubscription).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('FAILS CLOSED when the workspace itself is missing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage.getUser.mockImplementation(async (id: number) => (id === 2 ? user(2, 100) : undefined));
    mockStorage.getWorkspaceById!.mockResolvedValue(undefined);

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL_WORKSPACE_OWNER_MISSING]'));
    errSpy.mockRestore();
  });

  it('FAILS CLOSED when the user does not exist', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage.getUser.mockResolvedValue(undefined);

    const result = await getEffectiveSubscriptionStatus(404);
    expect(result.hasActiveSubscription).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL_WORKSPACE_OWNER_MISSING]'));
    errSpy.mockRestore();
  });

  it('FAILS CLOSED when workspace lookup is unavailable', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage.getUser.mockResolvedValue(user(2, 100));
    delete mockStorage.getWorkspaceById;

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL_WORKSPACE_OWNER_MISSING]'));
    errSpy.mockRestore();
  });
});
