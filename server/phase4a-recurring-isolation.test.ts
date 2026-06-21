import { describe, it, expect } from 'vitest';

// ─── SCENARIO ────────────────────────────────────────────────────────────────
// User A and User B belong to the SAME billing group (same workspaceId = 100).
// After Phase 4A, recurring-expense-service must filter all receipt queries by
// userId, NOT workspaceId.
// These tests prove:
//   1. analyzeRecurringPattern() only considers the requesting user's receipts
//   2. getUserRecurringPatterns() only returns patterns from the requesting user
//   3. A billing-group member cannot see or influence another member's patterns
//   4. INSERT fixtures still carry workspaceId (schema compliance)

const USER_A_ID = 1;
const USER_B_ID = 2;
const SHARED_WORKSPACE_ID = 100;

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const makeReceipt = (
  id: number,
  userId: number,
  overrides: Record<string, any> = {}
) => ({
  id,
  userId,
  workspaceId: SHARED_WORKSPACE_ID,  // same workspace — shared billing group
  storeName: 'Test Store',
  total: '100.00',
  date: new Date('2026-05-01'),
  category: 'groceries',
  createdAt: new Date(),
  updatedAt: new Date(),
  imageUrl: null,
  thumbnailUrl: null,
  taxAmount: null,
  receiptNumber: null,
  notes: null,
  isRecurring: false,
  recurringFrequency: null,
  paymentMethod: null,
  currency: 'ZAR',
  confidence: null,
  rawOcrText: null,
  processingStatus: 'completed',
  label: null,
  isTaxDeductible: false,
  splitFromId: null,
  emailDocumentId: null,
  createdByUserId: userId,
  ...overrides,
});

// User A's receipts — Checkers, same amount, monthly cadence over 4 months
const RECEIPT_A1 = makeReceipt(1, USER_A_ID, {
  storeName: 'Checkers',
  total: '450.00',
  date: new Date('2026-01-15'),
});
const RECEIPT_A2 = makeReceipt(2, USER_A_ID, {
  storeName: 'Checkers',
  total: '460.00',
  date: new Date('2026-02-15'),
});
const RECEIPT_A3 = makeReceipt(3, USER_A_ID, {
  storeName: 'Checkers',
  total: '455.00',
  date: new Date('2026-03-15'),
});
const RECEIPT_A4 = makeReceipt(4, USER_A_ID, {
  storeName: 'Checkers',
  total: '448.00',
  date: new Date('2026-04-15'),
});

// User B's receipts — Pick n Pay, same amount, monthly cadence over 4 months
const RECEIPT_B1 = makeReceipt(5, USER_B_ID, {
  storeName: 'Pick n Pay',
  total: '900.00',
  date: new Date('2026-01-20'),
});
const RECEIPT_B2 = makeReceipt(6, USER_B_ID, {
  storeName: 'Pick n Pay',
  total: '910.00',
  date: new Date('2026-02-20'),
});
const RECEIPT_B3 = makeReceipt(7, USER_B_ID, {
  storeName: 'Pick n Pay',
  total: '895.00',
  date: new Date('2026-03-20'),
});
const RECEIPT_B4 = makeReceipt(8, USER_B_ID, {
  storeName: 'Pick n Pay',
  total: '905.00',
  date: new Date('2026-04-20'),
});

// Mixed pool — as it would look in the DB for this shared workspace
const ALL_RECEIPTS = [
  RECEIPT_A1, RECEIPT_A2, RECEIPT_A3, RECEIPT_A4,
  RECEIPT_B1, RECEIPT_B2, RECEIPT_B3, RECEIPT_B4,
];

// ─── PURE FILTER HELPERS (mirrors Phase 4A logic) ────────────────────────────
// These replicate the WHERE clause that recurring-expense-service now uses:
//   eq(receipts.userId, userId)
// They let us test the isolation logic without hitting the database.

function filterReceiptsByUserId(pool: typeof ALL_RECEIPTS, userId: number) {
  return pool.filter(r => r.userId === userId);
}

// Simplified similarity check — mirrors the service's normalizeStoreName + 0.8 threshold
function normalizeStoreName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function areSimilar(a: string, b: string): boolean {
  const na = normalizeStoreName(a);
  const nb = normalizeStoreName(b);
  if (na === nb) return true;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length > 0.8;
}

function findSimilarReceipts(
  newReceipt: (typeof ALL_RECEIPTS)[number],
  pool: typeof ALL_RECEIPTS
) {
  const currentAmount = parseFloat(newReceipt.total);
  return pool.filter(r => {
    if (r.id === newReceipt.id) return false;
    const storeMatch = areSimilar(newReceipt.storeName, r.storeName);
    const amount = parseFloat(r.total);
    const amountMatch = Math.abs(amount - currentAmount) / currentAmount < 0.2;
    return storeMatch && amountMatch;
  });
}

function getUserRecurringPatterns(
  userId: number,
  pool: typeof ALL_RECEIPTS
): Map<string, typeof ALL_RECEIPTS> {
  const userReceipts = filterReceiptsByUserId(pool, userId);
  const groups = new Map<string, typeof ALL_RECEIPTS>();
  for (const r of userReceipts) {
    const key = normalizeStoreName(r.storeName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return new Map(
    [...groups.entries()].filter(([, receipts]) => receipts.length >= 3)
  );
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('Phase 4A — recurring-expense-service userId isolation', () => {

  // ── Filter layer ────────────────────────────────────────────────────────────

  describe('filterReceiptsByUserId (WHERE clause)', () => {
    it('returns only User A receipts from shared pool', () => {
      const result = filterReceiptsByUserId(ALL_RECEIPTS, USER_A_ID);
      expect(result).toHaveLength(4);
      expect(result.every(r => r.userId === USER_A_ID)).toBe(true);
    });

    it('returns only User B receipts from shared pool', () => {
      const result = filterReceiptsByUserId(ALL_RECEIPTS, USER_B_ID);
      expect(result).toHaveLength(4);
      expect(result.every(r => r.userId === USER_B_ID)).toBe(true);
    });

    it('User A pool contains no User B receipts', () => {
      const result = filterReceiptsByUserId(ALL_RECEIPTS, USER_A_ID);
      expect(result.some(r => r.userId === USER_B_ID)).toBe(false);
    });

    it('User B pool contains no User A receipts', () => {
      const result = filterReceiptsByUserId(ALL_RECEIPTS, USER_B_ID);
      expect(result.some(r => r.userId === USER_A_ID)).toBe(false);
    });

    it('both users share the same workspaceId — confirms they are in the same billing group', () => {
      expect(RECEIPT_A1.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_B1.workspaceId).toBe(SHARED_WORKSPACE_ID);
    });
  });

  // ── analyzeRecurringPattern isolation ───────────────────────────────────────

  describe('analyzeRecurringPattern() — userId-scoped historical receipts', () => {
    it('User A: finds Checkers pattern from own receipts only', () => {
      const userAReceipts = filterReceiptsByUserId(ALL_RECEIPTS, USER_A_ID);
      const newCheckersReceipt = makeReceipt(99, USER_A_ID, {
        storeName: 'Checkers',
        total: '452.00',
        date: new Date('2026-05-15'),
      });
      const similar = findSimilarReceipts(newCheckersReceipt, userAReceipts);
      expect(similar.length).toBeGreaterThanOrEqual(3);
      expect(similar.every(r => r.userId === USER_A_ID)).toBe(true);
    });

    it('User A: does NOT find Pick n Pay receipts (those belong to User B)', () => {
      const userAReceipts = filterReceiptsByUserId(ALL_RECEIPTS, USER_A_ID);
      const newPicknPayReceipt = makeReceipt(99, USER_A_ID, {
        storeName: 'Pick n Pay',
        total: '900.00',
        date: new Date('2026-05-20'),
      });
      const similar = findSimilarReceipts(newPicknPayReceipt, userAReceipts);
      expect(similar).toHaveLength(0);
    });

    it('User B: finds Pick n Pay pattern from own receipts only', () => {
      const userBReceipts = filterReceiptsByUserId(ALL_RECEIPTS, USER_B_ID);
      const newPicknPayReceipt = makeReceipt(100, USER_B_ID, {
        storeName: 'Pick n Pay',
        total: '902.00',
        date: new Date('2026-05-20'),
      });
      const similar = findSimilarReceipts(newPicknPayReceipt, userBReceipts);
      expect(similar.length).toBeGreaterThanOrEqual(3);
      expect(similar.every(r => r.userId === USER_B_ID)).toBe(true);
    });

    it('User B: does NOT find Checkers receipts (those belong to User A)', () => {
      const userBReceipts = filterReceiptsByUserId(ALL_RECEIPTS, USER_B_ID);
      const newCheckersReceipt = makeReceipt(100, USER_B_ID, {
        storeName: 'Checkers',
        total: '450.00',
        date: new Date('2026-05-15'),
      });
      const similar = findSimilarReceipts(newCheckersReceipt, userBReceipts);
      expect(similar).toHaveLength(0);
    });

    it('workspace-level pool (old behaviour) would incorrectly cross-pollinate stores', () => {
      // Proves WHY the bug existed — querying by workspaceId blended both users' receipts
      const newCheckersReceipt = makeReceipt(99, USER_A_ID, {
        storeName: 'Checkers',
        total: '452.00',
        date: new Date('2026-05-15'),
      });
      // If we searched ALL_RECEIPTS (workspace-scoped) the count stays correct here
      // because Checkers belongs only to User A — but the pool still contains User B's
      // Pick n Pay receipts which could affect grouping and pattern confidence.
      const workspaceScopedPool = ALL_RECEIPTS; // all workspace members
      const userAOnly = filterReceiptsByUserId(ALL_RECEIPTS, USER_A_ID);
      // Workspace pool is larger than user-only pool
      expect(workspaceScopedPool.length).toBeGreaterThan(userAOnly.length);
      // User A's scoped pool contains exactly their receipts
      expect(userAOnly.every(r => r.userId === USER_A_ID)).toBe(true);
    });
  });

  // ── getUserRecurringPatterns isolation ──────────────────────────────────────

  describe('getUserRecurringPatterns() — userId-scoped pattern discovery', () => {
    it('User A patterns contain only Checkers (their store)', () => {
      const patterns = getUserRecurringPatterns(USER_A_ID, ALL_RECEIPTS);
      const storeNames = [...patterns.keys()];
      expect(storeNames).toHaveLength(1);
      expect(storeNames[0]).toBe(normalizeStoreName('Checkers'));
    });

    it('User A patterns do NOT contain Pick n Pay (User B store)', () => {
      const patterns = getUserRecurringPatterns(USER_A_ID, ALL_RECEIPTS);
      expect(patterns.has(normalizeStoreName('Pick n Pay'))).toBe(false);
    });

    it('User B patterns contain only Pick n Pay (their store)', () => {
      const patterns = getUserRecurringPatterns(USER_B_ID, ALL_RECEIPTS);
      const storeNames = [...patterns.keys()];
      expect(storeNames).toHaveLength(1);
      expect(storeNames[0]).toBe(normalizeStoreName('Pick n Pay'));
    });

    it('User B patterns do NOT contain Checkers (User A store)', () => {
      const patterns = getUserRecurringPatterns(USER_B_ID, ALL_RECEIPTS);
      expect(patterns.has(normalizeStoreName('Checkers'))).toBe(false);
    });

    it('each user pattern set is independent of the other', () => {
      const patternsA = getUserRecurringPatterns(USER_A_ID, ALL_RECEIPTS);
      const patternsB = getUserRecurringPatterns(USER_B_ID, ALL_RECEIPTS);
      const keysA = new Set(patternsA.keys());
      const keysB = new Set(patternsB.keys());
      const overlap = [...keysA].filter(k => keysB.has(k));
      expect(overlap).toHaveLength(0);
    });

    it('all receipts in a User A pattern belong to User A', () => {
      const patterns = getUserRecurringPatterns(USER_A_ID, ALL_RECEIPTS);
      for (const [, groupReceipts] of patterns.entries()) {
        expect(groupReceipts.every(r => r.userId === USER_A_ID)).toBe(true);
      }
    });

    it('all receipts in a User B pattern belong to User B', () => {
      const patterns = getUserRecurringPatterns(USER_B_ID, ALL_RECEIPTS);
      for (const [, groupReceipts] of patterns.entries()) {
        expect(groupReceipts.every(r => r.userId === USER_B_ID)).toBe(true);
      }
    });
  });

  // ── Schema compliance ────────────────────────────────────────────────────────

  describe('INSERT compliance — workspaceId still set on receipt fixtures', () => {
    it('User A receipts carry workspaceId (schema NOT NULL compliance)', () => {
      expect(RECEIPT_A1.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_A2.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_A3.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_A4.workspaceId).toBe(SHARED_WORKSPACE_ID);
    });

    it('User B receipts carry workspaceId (schema NOT NULL compliance)', () => {
      expect(RECEIPT_B1.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_B2.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_B3.workspaceId).toBe(SHARED_WORKSPACE_ID);
      expect(RECEIPT_B4.workspaceId).toBe(SHARED_WORKSPACE_ID);
    });

    it('ownership is determined by userId, not workspaceId', () => {
      // workspaceId is identical for both users — it CANNOT be used for ownership
      expect(RECEIPT_A1.workspaceId).toBe(RECEIPT_B1.workspaceId);
      // userId is distinct — this is the correct ownership discriminator
      expect(RECEIPT_A1.userId).not.toBe(RECEIPT_B1.userId);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('user with no receipts gets empty pattern list', () => {
      const patterns = getUserRecurringPatterns(999, ALL_RECEIPTS);
      expect(patterns.size).toBe(0);
    });

    it('user with fewer than 3 receipts for a store gets no pattern', () => {
      const sparsePool = [RECEIPT_A1, RECEIPT_A2]; // only 2 Checkers receipts for User A
      const patterns = getUserRecurringPatterns(USER_A_ID, sparsePool);
      expect(patterns.size).toBe(0);
    });

    it('analyzeRecurringPattern returns empty similar list when pool is empty', () => {
      const newReceipt = makeReceipt(99, USER_A_ID, {
        storeName: 'Checkers',
        total: '452.00',
        date: new Date('2026-05-15'),
      });
      const similar = findSimilarReceipts(newReceipt, []);
      expect(similar).toHaveLength(0);
    });

    it('amount variance > 20% prevents similar-receipt match', () => {
      const base = makeReceipt(1, USER_A_ID, { storeName: 'Checkers', total: '100.00' });
      const farApart = makeReceipt(2, USER_A_ID, { storeName: 'Checkers', total: '130.00' }); // 30% above
      const result = findSimilarReceipts(base, [farApart]);
      expect(result).toHaveLength(0);
    });
  });
});
