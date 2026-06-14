import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Seat-capacity enforcement for workspace invites/membership and the one-click
 * upgrade path. Covers:
 *   1. getWorkspaceSeatInfo — capacity vs usage math, blocking when full,
 *      and over-capacity detection after a downgrade/expiry (no eviction).
 *   2. billingService.upgradeToPlanWithStoredAuth — capacity increases on a
 *      successful stored-authorization charge, refuses non-upgrades, and falls
 *      back to needs_checkout when there is no stored authorization.
 */

vi.mock('./vite', () => ({ log: vi.fn(), setupVite: vi.fn(), serveStatic: vi.fn() }));

// --- storage + subscription-status mocks ------------------------------------
const getWorkspaceById = vi.fn();
const getUser = vi.fn();
const getUserSubscription = vi.fn();
const getSubscriptionPlan = vi.fn();
const updateUserSubscription = vi.fn();

vi.mock('./storage', () => ({
  storage: {
    getWorkspaceById: (...a: any[]) => getWorkspaceById(...a),
    getUser: (...a: any[]) => getUser(...a),
    getSubscriptionPlan: (...a: any[]) => getSubscriptionPlan(...a),
    updateUserSubscription: (...a: any[]) => updateUserSubscription(...a),
  },
}));

const getSubscriptionStatus = vi.fn();
vi.mock('./subscription-middleware', () => ({
  getSubscriptionStatus: (...a: any[]) => getSubscriptionStatus(...a),
}));

// --- Drizzle-style db mock --------------------------------------------------
let selectQueue: any[] = [];
const takeNext = () => (selectQueue.length ? selectQueue.shift() : []);

function makeSelectChain(): any {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    groupBy: () => chain,
    orderBy: () => Promise.resolve(takeNext()),
    limit: () => Promise.resolve(takeNext()),
    returning: () => Promise.resolve(takeNext()),
    then: (resolve: any, reject: any) => Promise.resolve(takeNext()).then(resolve, reject),
  };
  return chain;
}

const insertedValues: any[] = [];
const updatedSets: any[] = [];

const insertBuilder = () => {
  const b: any = {
    values: (v: any) => {
      insertedValues.push(v);
      b._returning = false;
      const ret: any = {
        onConflictDoNothing: () => Promise.resolve(),
        returning: () => Promise.resolve(takeNext()),
        then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      };
      return ret;
    },
  };
  return b;
};
const updateBuilder = () => ({
  set: (v: any) => {
    updatedSets.push(v);
    return {
      where: () => ({
        returning: () => Promise.resolve(takeNext()),
        then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      }),
    };
  },
});

const txMock = {
  select: () => makeSelectChain(),
  insert: vi.fn(() => insertBuilder()),
  update: vi.fn(() => updateBuilder()),
};

const dbMock: any = {
  select: () => makeSelectChain(),
  insert: () => insertBuilder(),
  update: () => updateBuilder(),
  transaction: async (cb: any) => cb(txMock),
};

vi.mock('./db', () => ({ db: dbMock, pool: {} }));

let getWorkspaceSeatInfo: typeof import('./workspace-seats')['getWorkspaceSeatInfo'];
let billingService: typeof import('./billing-service')['billingService'];

beforeAll(async () => {
  ({ getWorkspaceSeatInfo } = await import('./workspace-seats'));
  ({ billingService } = await import('./billing-service'));
}, 30000);

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  insertedValues.length = 0;
  updatedSets.length = 0;
  (billingService as any).paystack = undefined;
});

const seatCount = (n: number) => [{ count: n }];

describe('getWorkspaceSeatInfo (capacity vs usage)', () => {
  it('reports available seats and allows growth when under capacity', async () => {
    getWorkspaceById.mockResolvedValue({ id: 100, ownerId: 1 });
    getSubscriptionStatus.mockResolvedValue({ seatCapacity: 5 });
    // members = 2, pending invites = 1
    selectQueue = [seatCount(2), seatCount(1)];

    const info = await getWorkspaceSeatInfo(100);
    expect(info.capacity).toBe(5);
    expect(info.usedSeats).toBe(2);
    expect(info.pendingInvites).toBe(1);
    expect(info.reservedSeats).toBe(3);
    expect(info.availableSeats).toBe(2);
    expect(info.isOverCapacity).toBe(false);
  });

  it('blocks growth (availableSeats=0) when members + pending fill capacity', async () => {
    getWorkspaceById.mockResolvedValue({ id: 100, ownerId: 1 });
    getSubscriptionStatus.mockResolvedValue({ seatCapacity: 5 });
    // members = 4, pending invites = 1 -> reserved 5 == capacity
    selectQueue = [seatCount(4), seatCount(1)];

    const info = await getWorkspaceSeatInfo(100);
    expect(info.availableSeats).toBe(0);
    expect(info.isOverCapacity).toBe(false);
  });

  it('flags over-capacity after a downgrade/expiry without evicting members', async () => {
    getWorkspaceById.mockResolvedValue({ id: 100, ownerId: 1 });
    // Owner sub expired -> capacity falls back to Solo (1 seat).
    getSubscriptionStatus.mockResolvedValue({ seatCapacity: undefined });
    // 3 members already exist (e.g. from a previous Team plan).
    selectQueue = [seatCount(3), seatCount(0)];

    const info = await getWorkspaceSeatInfo(100);
    expect(info.capacity).toBe(1); // fallback
    expect(info.usedSeats).toBe(3); // members retained, never evicted
    expect(info.isOverCapacity).toBe(true);
    expect(info.availableSeats).toBe(0); // growth blocked
  });

  it('defaults capacity to 1 when there is no owner', async () => {
    getWorkspaceById.mockResolvedValue({ id: 100, ownerId: null });
    selectQueue = [seatCount(1), seatCount(0)];

    const info = await getWorkspaceSeatInfo(100);
    expect(info.capacity).toBe(1);
    expect(getSubscriptionStatus).not.toHaveBeenCalled();
  });
});

describe('billingService.upgradeToPlanWithStoredAuth', () => {
  const soloPlan = { id: 2, name: 'premium_monthly', displayName: 'Solo', price: 4900, billingPeriod: 'monthly', maxSeats: 1, isActive: true, paystackPlanCode: 'PLN_solo' };
  const teamS = { id: 4, name: 'team_s', displayName: 'Team S', price: 29900, billingPeriod: 'monthly', maxSeats: 5, isActive: true, paystackPlanCode: 'PLN_team_s' };

  it('charges the stored authorization and increases capacity on success', async () => {
    getSubscriptionPlan.mockImplementation(async (id: number) => (id === 4 ? teamS : id === 2 ? soloPlan : null));
    getUser.mockResolvedValue({ id: 1, email: 'owner@x.com', workspaceId: 100 });

    // getUserSubscription is a method on billingService; stub it.
    vi.spyOn(billingService as any, 'getUserSubscription').mockResolvedValue({
      id: 9, userId: 1, planId: 2, status: 'active', totalPaid: 4900,
      authorizationCode: 'AUTH_abc', paystackCustomerCode: 'CUS_1',
    });

    const charge = vi.fn().mockResolvedValue({
      status: true,
      data: { status: 'success', reference: 'ref', authorization: { authorization_code: 'AUTH_abc' }, customer: { customer_code: 'CUS_1' } },
    });
    (billingService as any).paystack = { transaction: { charge } };

    // db.transaction returning: userSubscriptions update .returning() -> [row]
    selectQueue = [[{ id: 9, userId: 1, planId: 4, status: 'active' }]];

    const result = await billingService.upgradeToPlanWithStoredAuth(1, 4);

    expect(charge).toHaveBeenCalledWith(expect.objectContaining({
      authorization_code: 'AUTH_abc',
      email: 'owner@x.com',
      amount: 29900,
    }));
    expect(result.success).toBe(true);
    expect(result.plan?.maxSeats).toBe(5);
    // Plan switched locally to the higher-capacity tier.
    expect(updatedSets).toContainEqual(expect.objectContaining({ planId: 4 }));
  });

  it('refuses a non-upgrade (target seats <= current capacity)', async () => {
    getSubscriptionPlan.mockImplementation(async (id: number) => (id === 4 ? teamS : id === 2 ? soloPlan : null));
    getUser.mockResolvedValue({ id: 1, email: 'owner@x.com', workspaceId: 100 });
    vi.spyOn(billingService as any, 'getUserSubscription').mockResolvedValue({
      id: 9, userId: 1, planId: 4, status: 'active', authorizationCode: 'AUTH_abc',
    });
    // target = soloPlan (1 seat) while current is team_s (5 seats) -> not an upgrade
    await expect(billingService.upgradeToPlanWithStoredAuth(1, 2)).rejects.toThrow('not_an_upgrade');
  });

  it('falls back to needs_checkout when there is no stored authorization', async () => {
    getSubscriptionPlan.mockImplementation(async (id: number) => (id === 4 ? teamS : id === 2 ? soloPlan : null));
    getUser.mockResolvedValue({ id: 1, email: 'owner@x.com', workspaceId: 100 });
    vi.spyOn(billingService as any, 'getUserSubscription').mockResolvedValue({
      id: 9, userId: 1, planId: 2, status: 'active', authorizationCode: null,
    });

    const result = await billingService.upgradeToPlanWithStoredAuth(1, 4);
    expect(result.success).toBe(false);
    expect(result.needsCheckout).toBe(true);
    expect(result.reason).toBe('no_stored_authorization');
  });

  it('falls back to needs_checkout when there is no existing subscription', async () => {
    getSubscriptionPlan.mockImplementation(async (id: number) => (id === 4 ? teamS : null));
    vi.spyOn(billingService as any, 'getUserSubscription').mockResolvedValue(undefined);

    const result = await billingService.upgradeToPlanWithStoredAuth(1, 4);
    expect(result.success).toBe(false);
    expect(result.needsCheckout).toBe(true);
    expect(result.reason).toBe('no_existing_subscription');
  });
});
