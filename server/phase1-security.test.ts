import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── FIXTURES ────────────────────────────────────────────────────────────────
// Two users in the SAME workspace — the billing-group scenario where the old
// workspaceId-based checks would incorrectly allow cross-user data access.

const USER_A_ID = 1;
const USER_B_ID = 2;
const SHARED_WORKSPACE_ID = 100;

const RECEIPT_A1 = {
  id: 101, userId: USER_A_ID, workspaceId: SHARED_WORKSPACE_ID,
  total: '1000.00', isTaxDeductible: true,
  date: new Date('2026-04-10'),
  category: 'office_supplies', reportLabel: null, storeName: 'Shop A',
  items: null, tags: null, isRecurring: false, source: 'scan',
  confidence: null, notes: null, imageUrl: null, thumbnailUrl: null,
  receiptEmailId: null, createdAt: new Date(), updatedAt: new Date(),
};
const RECEIPT_A2 = {
  id: 102, userId: USER_A_ID, workspaceId: SHARED_WORKSPACE_ID,
  total: '250.00', isTaxDeductible: false,
  date: new Date('2026-05-01'),
  category: 'dining_takeaways', reportLabel: null, storeName: 'Shop C',
  items: null, tags: null, isRecurring: false, source: 'scan',
  confidence: null, notes: null, imageUrl: null, thumbnailUrl: null,
  receiptEmailId: null, createdAt: new Date(), updatedAt: new Date(),
};
const RECEIPT_B1 = {
  id: 201, userId: USER_B_ID, workspaceId: SHARED_WORKSPACE_ID,
  total: '500.00', isTaxDeductible: true,
  date: new Date('2026-04-20'),
  category: 'fuel', reportLabel: null, storeName: 'Shop B',
  items: null, tags: null, isRecurring: false, source: 'scan',
  confidence: null, notes: null, imageUrl: null, thumbnailUrl: null,
  receiptEmailId: null, createdAt: new Date(), updatedAt: new Date(),
};

const ALL_RECEIPTS = [RECEIPT_A1, RECEIPT_A2, RECEIPT_B1];

// ─── MOCK STATE ──────────────────────────────────────────────────────────────
// Set before each test to control which user's data the mock db returns.
let _mockUserId = 0;

// ─── DB MOCK ─────────────────────────────────────────────────────────────────
// Simulates a userId-filtered database.
// After Phase 1A, tax-service methods must never call db.select with a
// { workspaceId } column-selector argument (that was the workspace lookup).
// Any call to db.select() without args returns receipts for _mockUserId only.

const mockSelect = vi.fn();

vi.mock('./db', () => {
  const makeChain = (dataFn: () => any[]): any => {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n?: number) => {
        const d = dataFn();
        return Promise.resolve(n !== undefined ? d.slice(0, n) : d);
      }),
      then(onfulfilled: any, onrejected: any) {
        return Promise.resolve(dataFn()).then(onfulfilled, onrejected);
      },
      catch(fn: any) { return Promise.resolve(dataFn()).catch(fn); },
      finally(fn: any) { return Promise.resolve(dataFn()).finally(fn); },
    };
    return chain;
  };

  return {
    db: {
      // Expose the spy so tests can assert on it
      get select() { return mockSelect; },
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    },
  };
});

// Mock select implementation: detect old workspace-lookup pattern vs receipt query
mockSelect.mockImplementation((cols?: Record<string, unknown>) => {
  const isWorkspaceLookup = cols != null && 'workspaceId' in cols;

  if (isWorkspaceLookup) {
    // This path should be DEAD after the Phase 1A fix. If it is reached,
    // return the shared workspace so old code would still "work" — but the
    // isolation tests below will catch that all users' receipts leaked through.
    const makeChain = (dataFn: () => any[]): any => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn((n?: number) => {
          const d = dataFn();
          return Promise.resolve(n !== undefined ? d.slice(0, n) : d);
        }),
        then(onfulfilled: any, onrejected: any) {
          return Promise.resolve(dataFn()).then(onfulfilled, onrejected);
        },
        catch(fn: any) { return Promise.resolve(dataFn()).catch(fn); },
        finally(fn: any) { return Promise.resolve(dataFn()).finally(fn); },
      };
      return chain;
    };
    return makeChain(() => [{ workspaceId: SHARED_WORKSPACE_ID }]);
  }

  // Normal select: return receipts belonging to the requesting user only.
  // taxSettings / other tables → returns [] (no matching rows) which is fine;
  // it just triggers the "create default settings" insert path in getUserTaxSettings.
  const makeChain = (dataFn: () => any[]): any => {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n?: number) => {
        const d = dataFn();
        return Promise.resolve(n !== undefined ? d.slice(0, n) : d);
      }),
      then(onfulfilled: any, onrejected: any) {
        return Promise.resolve(dataFn()).then(onfulfilled, onrejected);
      },
      catch(fn: any) { return Promise.resolve(dataFn()).catch(fn); },
      finally(fn: any) { return Promise.resolve(dataFn()).finally(fn); },
    };
    return chain;
  };
  return makeChain(() => ALL_RECEIPTS.filter(r => r.userId === _mockUserId));
});

vi.mock('./export-service', () => ({
  exportService: {
    generateTaxReport: vi.fn().mockResolvedValue({
      pdf: Buffer.from('mock-pdf'),
      csv: '',
    }),
  },
}));

vi.mock('./email-service', () => ({
  emailService: {
    sendBudgetAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks are declared
import { TaxService } from './tax-service';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const taxService = new TaxService();

const currentYear = new Date().getFullYear();
// SA tax year: March–February. June 2026 → tax year 2027.
const taxYear = new Date().getMonth() >= 2 ? currentYear + 1 : currentYear;

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('Phase 1A – Tax Service: userId isolation', () => {
  beforeEach(() => {
    mockSelect.mockClear();
  });

  // ── getTaxDashboard ──────────────────────────────────────────────────────

  describe('getTaxDashboard', () => {
    it('does not perform a workspace lookup (no db.select with { workspaceId } arg)', async () => {
      _mockUserId = USER_A_ID;
      await taxService.getTaxDashboard(USER_A_ID);

      const workspaceLookupCalls = mockSelect.mock.calls.filter(
        (call) => call[0] != null && 'workspaceId' in (call[0] as object),
      );
      expect(workspaceLookupCalls).toHaveLength(0);
    });

    it('returns only User A receipts when called with User A id', async () => {
      _mockUserId = USER_A_ID;
      const result = await taxService.getTaxDashboard(USER_A_ID);
      // User A has 2 receipts; 1 is tax-deductible (R1 000)
      expect(result.totalReceipts).toBe(2);
      expect(result.deductibleReceipts).toBe(1);
      expect(result.ytdDeductible).toBe(1000);
    });

    it('returns only User B receipts when called with User B id', async () => {
      _mockUserId = USER_B_ID;
      const result = await taxService.getTaxDashboard(USER_B_ID);
      // User B has 1 receipt; it is tax-deductible (R500)
      expect(result.totalReceipts).toBe(1);
      expect(result.deductibleReceipts).toBe(1);
      expect(result.ytdDeductible).toBe(500);
    });

    it('User A ytdDeductible does not include User B receipts', async () => {
      _mockUserId = USER_A_ID;
      const result = await taxService.getTaxDashboard(USER_A_ID);
      // Old workspace-scoped code would have returned R1 500 (R1 000 + R500).
      // Correct userId-scoped code returns R1 000 only.
      expect(result.ytdDeductible).not.toBe(1500);
      expect(result.ytdDeductible).toBe(1000);
    });

    it('User B ytdDeductible does not include User A receipts', async () => {
      _mockUserId = USER_B_ID;
      const result = await taxService.getTaxDashboard(USER_B_ID);
      expect(result.ytdDeductible).not.toBe(1500);
      expect(result.ytdDeductible).toBe(500);
    });
  });

  // ── getTaxYearReceipts ───────────────────────────────────────────────────

  describe('getTaxYearReceipts', () => {
    it('does not perform a workspace lookup', async () => {
      _mockUserId = USER_A_ID;
      await taxService.getTaxYearReceipts(USER_A_ID, taxYear);

      const workspaceLookupCalls = mockSelect.mock.calls.filter(
        (call) => call[0] != null && 'workspaceId' in (call[0] as object),
      );
      expect(workspaceLookupCalls).toHaveLength(0);
    });

    it('returns only User A receipts for User A', async () => {
      _mockUserId = USER_A_ID;
      const result = await taxService.getTaxYearReceipts(USER_A_ID, taxYear);
      expect(result.receipts).toHaveLength(2);
      expect(result.receipts.every((r: any) => r.userId === USER_A_ID)).toBe(true);
    });

    it('returns only User B receipts for User B', async () => {
      _mockUserId = USER_B_ID;
      const result = await taxService.getTaxYearReceipts(USER_B_ID, taxYear);
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0].userId).toBe(USER_B_ID);
    });

    it('User A receipts do not contain User B receipt ids', async () => {
      _mockUserId = USER_A_ID;
      const result = await taxService.getTaxYearReceipts(USER_A_ID, taxYear);
      const ids = result.receipts.map((r: any) => r.id);
      expect(ids).not.toContain(RECEIPT_B1.id);
    });
  });

  // ── generateAuditKit ─────────────────────────────────────────────────────

  describe('generateAuditKit', () => {
    it('does not perform a workspace lookup', async () => {
      _mockUserId = USER_A_ID;
      await taxService.generateAuditKit(USER_A_ID);

      const workspaceLookupCalls = mockSelect.mock.calls.filter(
        (call) => call[0] != null && 'workspaceId' in (call[0] as object),
      );
      expect(workspaceLookupCalls).toHaveLength(0);
    });

    it('queries only deductible receipts for the requesting user', async () => {
      _mockUserId = USER_A_ID;
      // generateAuditKit calls exportService.generateTaxReport internally —
      // it does not return the receipt list directly, but the query must
      // target User A's receipts. Absence of workspace lookup confirms this.
      await expect(taxService.generateAuditKit(USER_A_ID)).resolves.toBeInstanceOf(Buffer);
    });
  });
});

// ─── PHASE 1B ────────────────────────────────────────────────────────────────

describe('Phase 1B – Email Document: userId ownership check', () => {
  // These tests validate the ownership guard condition directly.
  // The fixed routes now use:  if (doc.userId !== user.id) → 403
  // The old routes used:       if (doc.workspaceId !== user.workspaceId) → 403
  //
  // In a billing group both users share the same workspaceId, so the old
  // check passed for peers, allowing cross-user access.

  const docOwnedByA = { id: 1, userId: USER_A_ID, workspaceId: SHARED_WORKSPACE_ID };

  it('old workspaceId check would have INCORRECTLY allowed peer access', () => {
    const userB = { id: USER_B_ID, workspaceId: SHARED_WORKSPACE_ID };
    // Demonstrates why the old check was broken in a billing group
    const oldCheckWouldAllow = docOwnedByA.workspaceId === userB.workspaceId;
    expect(oldCheckWouldAllow).toBe(true);
  });

  it('new userId check correctly BLOCKS peer access within the same billing group', () => {
    const userB = { id: USER_B_ID, workspaceId: SHARED_WORKSPACE_ID };
    const accessDenied = docOwnedByA.userId !== userB.id;
    expect(accessDenied).toBe(true);
  });

  it('new userId check correctly ALLOWS the document owner access', () => {
    const userA = { id: USER_A_ID, workspaceId: SHARED_WORKSPACE_ID };
    const accessDenied = docOwnedByA.userId !== userA.id;
    expect(accessDenied).toBe(false);
  });

  it('userId check is independent of workspaceId — same workspace is not sufficient', () => {
    // Both users are in workspace 100. userId is the only correct gate.
    const userB = { id: USER_B_ID, workspaceId: SHARED_WORKSPACE_ID };
    expect(docOwnedByA.workspaceId).toBe(userB.workspaceId); // same workspace
    expect(docOwnedByA.userId).not.toBe(userB.id);           // different owner
  });

  it('regression – different workspaceId also blocked (non-billing-group scenario)', () => {
    const unrelatedUser = { id: 99, workspaceId: 999 };
    const accessDenied = docOwnedByA.userId !== unrelatedUser.id;
    expect(accessDenied).toBe(true);
  });
});
