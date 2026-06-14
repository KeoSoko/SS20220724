import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage module BEFORE importing the unit under test.
vi.mock('./storage', () => ({
  storage: {
    getUser: vi.fn(),
    getWorkspaceById: vi.fn(),
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
  },
}));

import { storage } from './storage';
import { getSubscriptionStatus, getEffectiveSubscriptionStatus } from './subscription-middleware';

const mockStorage = storage as unknown as {
  getUser: ReturnType<typeof vi.fn>;
  getWorkspaceById?: ReturnType<typeof vi.fn>;
  getUserSubscription: ReturnType<typeof vi.fn>;
  getSubscriptionPlan?: ReturnType<typeof vi.fn>;
};

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const user = (id: number, workspaceId: number) => ({ id, workspaceId } as any);
const workspace = (id: number, ownerId: number) => ({ id, ownerId } as any);
const activeSubOnPlan = (planId: number) =>
  ({ status: 'active', planId, nextBillingDate: daysFromNow(20), paystackReference: 'ref_x' } as any);
const trialSubOnPlan = (planId: number) =>
  ({ status: 'trial', planId, trialEndDate: daysFromNow(10) } as any);

// Seat capacity is derived from the plan's max_seats.
const plan = (id: number, name: string, maxSeats: number) => ({ id, name, maxSeats } as any);
const PLAN_SEATS: Record<number, ReturnType<typeof plan>> = {
  2: plan(2, 'premium_monthly', 1), // Solo
  4: plan(4, 'team_s', 5),
  5: plan(5, 'team_m', 10),
  6: plan(6, 'team_l', 20),
  7: plan(7, 'team_xl', 50),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getWorkspaceById = vi.fn();
  mockStorage.getSubscriptionPlan = vi.fn(async (id: number) => PLAN_SEATS[id] ?? null);
});

describe('seat capacity (getSubscriptionStatus)', () => {
  it.each([
    ['Solo', 2, 1],
    ['Team S', 4, 5],
    ['Team M', 5, 10],
    ['Team L', 6, 20],
    ['Team XL', 7, 50],
  ])('reports the %s seat capacity from the active plan', async (_label, planId, expectedSeats) => {
    mockStorage.getUserSubscription.mockResolvedValue(activeSubOnPlan(planId));

    const result = await getSubscriptionStatus(1);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.seatCapacity).toBe(expectedSeats);
  });

  it('reports the plan seat capacity during trial', async () => {
    mockStorage.getUserSubscription.mockResolvedValue(trialSubOnPlan(6));

    const result = await getSubscriptionStatus(1);
    expect(result.isInTrial).toBe(true);
    expect(result.seatCapacity).toBe(20);
  });

  it('defaults to 1 seat when the plan has no resolvable max_seats', async () => {
    mockStorage.getUserSubscription.mockResolvedValue(activeSubOnPlan(999));
    mockStorage.getSubscriptionPlan!.mockResolvedValue(null);

    const result = await getSubscriptionStatus(1);
    expect(result.seatCapacity).toBe(1);
  });
});

describe('seat capacity inheritance (getEffectiveSubscriptionStatus)', () => {
  it('member inherits the owner\'s Team plan seat capacity', async () => {
    // member id 2, owner id 1, workspace 100, owner on Team L (20 seats)
    mockStorage.getUser.mockImplementation(async (id: number) =>
      id === 2 ? user(2, 100) : id === 1 ? user(1, 100) : undefined,
    );
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockImplementation(async (id: number) =>
      id === 1 ? activeSubOnPlan(6) : undefined,
    );

    const result = await getEffectiveSubscriptionStatus(2);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.seatCapacity).toBe(20);
    // The owner's subscription/plan is consulted, never the member's.
    expect(mockStorage.getUserSubscription).toHaveBeenCalledWith(1);
    expect(mockStorage.getUserSubscription).not.toHaveBeenCalledWith(2);
  });

  it('owner sees their own Team plan seat capacity', async () => {
    mockStorage.getUser.mockImplementation(async (id: number) => (id === 1 ? user(1, 100) : undefined));
    mockStorage.getWorkspaceById!.mockResolvedValue(workspace(100, 1));
    mockStorage.getUserSubscription.mockResolvedValue(activeSubOnPlan(7));

    const result = await getEffectiveSubscriptionStatus(1);
    expect(result.seatCapacity).toBe(50);
  });
});
