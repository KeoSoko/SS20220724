import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression test for the workspace-invite-acceptance flow.
 *
 * Original bug: accepting a workspace invite cancelled the *invitee's own*
 * paid subscription. The fix (Workspace Subscription Inheritance) removed that
 * call — access now inherits from the workspace owner, so the invitee's own
 * subscription must be left completely untouched.
 *
 * This test locks that behaviour in two complementary ways:
 *   1. Behavioural — drives the REAL accept-invite handler and asserts a
 *      membership is created while `billingService.cancelSubscription` is never
 *      called and the invitee's subscription is never read or written.
 *   2. Source invariant — statically guarantees the handler body can never
 *      reintroduce a `cancelSubscription` / `userSubscriptions` write on ANY
 *      branch, even ones the behavioural happy-path doesn't exercise.
 */

// --- Spies we assert on -----------------------------------------------------
const cancelSubscription = vi.fn();
const getUser = vi.fn();
const getUserSubscription = vi.fn();

// --- Mock side-effecting / heavy modules so importing ./routes is clean -----
vi.mock('./auth', () => ({ setupAuth: vi.fn(), comparePasswords: vi.fn() }));
vi.mock('./admin-routes', () => ({ registerAdminRoutes: vi.fn() }));
vi.mock('./vite', () => ({ log: vi.fn(), setupVite: vi.fn(), serveStatic: vi.fn() }));
vi.mock('./billing-service', () => ({ billingService: { cancelSubscription } }));
vi.mock('./storage', () => ({ storage: { getUser, getUserSubscription } }));

// --- Drizzle-style db mock --------------------------------------------------
// A queue feeds the handler's sequential reads in call order.
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
    // Make the chain awaitable for selects that end without .limit().
    then: (resolve: any, reject: any) => Promise.resolve(takeNext()).then(resolve, reject),
  };
  return chain;
}

// Records every row object inserted via the transaction.
const insertedValues: any[] = [];
const updatedTables: any[] = [];

const insertBuilder = () => ({
  values: (v: any) => { insertedValues.push(v); return Promise.resolve(); },
});
const updateBuilder = () => ({
  set: () => ({ where: () => Promise.resolve() }),
});
const deleteBuilder = () => ({ where: () => Promise.resolve() });

const txMock = {
  select: () => makeSelectChain(),
  insert: vi.fn(() => insertBuilder()),
  update: vi.fn(() => { updatedTables.push(true); return updateBuilder(); }),
  delete: vi.fn(() => deleteBuilder()),
};

const dbMock: any = {
  select: () => makeSelectChain(),
  insert: () => insertBuilder(),
  update: () => updateBuilder(),
  delete: () => deleteBuilder(),
  transaction: async (cb: any) => cb(txMock),
  query: { users: { findFirst: async () => undefined } },
};

vi.mock('./db', () => ({ db: dbMock, pool: {} }));

// --- Capture the real handler by registering routes on a fake app -----------
async function captureAcceptInviteHandler(): Promise<(req: any, res: any) => any> {
  const registered: Record<string, Map<string, Function[]>> = {};
  const app: any = function () {}; // function so http.createServer(app) accepts it
  const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all', 'use'];
  for (const m of httpMethods) {
    app[m] = (...args: any[]) => {
      if (typeof args[0] === 'string') {
        const handlers = args.slice(1).filter((a) => typeof a === 'function');
        (registered[m] ||= new Map()).set(args[0], handlers);
      }
      return app;
    };
  }
  app.set = () => app;
  app.engine = () => app;
  app.locals = {};

  const { registerRoutes } = await import('./routes');
  await registerRoutes(app as any);

  const handlers = registered['post']?.get('/api/workspace/accept-invite');
  if (!handlers || handlers.length === 0) {
    throw new Error('accept-invite handler was not registered');
  }
  return handlers[handlers.length - 1] as any;
}

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.sendStatus = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  insertedValues.length = 0;
  updatedTables.length = 0;
});

describe('POST /api/workspace/accept-invite (behavioural)', () => {
  it('creates membership, never cancels the invitee subscription, never touches their sub', async () => {
    const handler = await captureAcceptInviteHandler();

    // Invitee (user 7) belongs to their own workspace (2) and joins workspace 100.
    getUser.mockImplementation(async (id: number) =>
      id === 7 ? { id: 7, workspaceId: 2, username: 'Invitee', email: 'invitee@x.com' } : undefined,
    );
    // If the invitee's own subscription were inspected, this would record a call.
    getUserSubscription.mockResolvedValue({ status: 'active', nextBillingDate: future() });

    const invite = {
      id: 55,
      token: 'tok123',
      workspaceId: 100,
      email: 'invitee@x.com',
      role: 'editor',
      invitedByUserId: 1,
      acceptedAt: null,
      expiresAt: future(),
    };

    // Read order: invite lookup, existing membership, current ownership, owner check.
    selectQueue = [[invite], [], [], []];

    const req: any = {
      body: { token: 'tok123', migrateData: false },
      isAuthenticated: () => true,
      user: { id: 7 },
    };
    const res = makeRes();

    await handler(req, res);

    // (1) Membership created for the invitee in the target workspace.
    expect(txMock.insert).toHaveBeenCalledTimes(1);
    expect(insertedValues).toEqual([
      expect.objectContaining({ workspaceId: 100, userId: 7, role: 'editor' }),
    ]);

    // (3) cancelSubscription must NEVER be called during invite acceptance.
    expect(cancelSubscription).not.toHaveBeenCalled();

    // (2) Invitee's own subscription is never even read, let alone modified.
    expect(getUserSubscription).not.toHaveBeenCalled();

    // Happy-path response.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, workspaceId: 100, role: 'editor' }),
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});

describe('accept-invite handler (source invariant)', () => {
  it('handler body contains no cancelSubscription call or user_subscriptions write', () => {
    const source = readFileSync(join(__dirname, 'routes.ts'), 'utf8');
    const start = source.indexOf('app.post("/api/workspace/accept-invite"');
    expect(start).toBeGreaterThan(-1);
    // The handler ends where the next route registration begins.
    const end = source.indexOf('app.delete("/api/workspace/invite/:inviteId"', start);
    expect(end).toBeGreaterThan(start);

    const handlerSource = source.slice(start, end);

    // The bug guard: this flow must never cancel a subscription...
    expect(handlerSource).not.toMatch(/cancelSubscription/);
    // ...nor write to the user_subscriptions table in any form.
    expect(handlerSource).not.toMatch(/update\(\s*userSubscriptions/);
    expect(handlerSource).not.toMatch(/insert\(\s*userSubscriptions/);

    // Sanity: it really is the handler that creates workspace membership.
    expect(handlerSource).toMatch(/insert\(workspaceMembers\)/);
  });
});
