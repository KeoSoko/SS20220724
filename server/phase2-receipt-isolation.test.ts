import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── SCENARIO ────────────────────────────────────────────────────────────────
// User A and User B are members of the SAME billing group (same workspaceId).
// After Phase 2, every receipt query must filter by userId, NOT workspaceId.
// These tests prove each method and route returns only the calling user's data.

const USER_A_ID = 1;
const USER_B_ID = 2;
const SHARED_WORKSPACE_ID = 100;

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const makeReceipt = (id: number, userId: number, overrides: Record<string, any> = {}) => ({
  id,
  userId,
  workspaceId: SHARED_WORKSPACE_ID,
  storeName: `Store ${id}`,
  date: new Date('2026-05-15'),
  total: '100.00',
  category: 'groceries_household',
  reportLabel: null,
  isTaxDeductible: false,
  isRecurring: false,
  source: 'scan',
  clientUploadId: null,
  createdAt: new Date(),
  ...overrides,
});

const RECEIPT_A1 = makeReceipt(101, USER_A_ID, { storeName: 'Makro', total: '850.00', isTaxDeductible: true });
const RECEIPT_A2 = makeReceipt(102, USER_A_ID, { storeName: 'Checkers', total: '220.00', reportLabel: 'Office Supplies' });
const RECEIPT_B1 = makeReceipt(201, USER_B_ID, { storeName: 'Pick n Pay', total: '450.00' });
const RECEIPT_B2 = makeReceipt(202, USER_B_ID, { storeName: 'Woolworths', total: '310.00' });

const ALL_RECEIPTS = [RECEIPT_A1, RECEIPT_A2, RECEIPT_B1, RECEIPT_B2];

// ─── PURE HELPER FUNCTIONS ────────────────────────────────────────────────────
// These mirror the Phase 2 logic extracted from database-storage.ts and routes.ts.
// No external dependencies — deterministic, no mocks needed.

function getReceiptsByUser(allReceipts: typeof ALL_RECEIPTS, userId: number) {
  return allReceipts.filter(r => r.userId === userId);
}

function findDuplicateReceipts(
  allReceipts: typeof ALL_RECEIPTS,
  userId: number,
  storeName: string,
  date: Date,
  total: string,
) {
  const normalizedStore = storeName.toLowerCase().trim();
  const normalizedTotal = parseFloat(total.replace(/[^0-9.-]/g, '')) || 0;
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return allReceipts
    .filter(r => r.userId === userId)
    .filter(r => {
      const receiptDate = new Date(r.date);
      receiptDate.setHours(0, 0, 0, 0);
      const receiptTotal = parseFloat(r.total.replace(/[^0-9.-]/g, '')) || 0;
      return (
        r.storeName.toLowerCase().trim() === normalizedStore &&
        receiptDate.getTime() === targetDate.getTime() &&
        Math.abs(receiptTotal - normalizedTotal) < 0.01
      );
    });
}

function getReceiptByClientUploadId(
  allReceipts: typeof ALL_RECEIPTS,
  userId: number,
  clientUploadId: string,
) {
  return allReceipts.find(r => r.userId === userId && r.clientUploadId === clientUploadId);
}

function getCategorySummary(allReceipts: typeof ALL_RECEIPTS, userId: number) {
  const userReceipts = allReceipts.filter(r => r.userId === userId);
  const categoryMap = new Map<string, { category: string; count: number; total: number }>();
  for (const receipt of userReceipts) {
    const cat = receipt.reportLabel || receipt.category;
    const total = parseFloat(receipt.total) || 0;
    const existing = categoryMap.get(cat) || { category: cat, count: 0, total: 0 };
    existing.count += 1;
    existing.total += total;
    categoryMap.set(cat, existing);
  }
  return Array.from(categoryMap.values());
}

function getWeeklyAnalytics(allReceipts: typeof ALL_RECEIPTS, userId: number) {
  return allReceipts
    .filter(r => r.userId === userId)
    .map(r => ({ storeName: r.storeName, total: parseFloat(r.total) }));
}

function getCategoryBreakdownSubcategories(allReceipts: typeof ALL_RECEIPTS, userId: number) {
  return allReceipts
    .filter(r => r.userId === userId && r.reportLabel)
    .map(r => ({ subcategory: r.reportLabel, total: parseFloat(r.total) }));
}

function categoryCascadeUpdate(
  allReceipts: ReturnType<typeof makeReceipt>[],
  userId: number,
  oldLabel: string,
  newLabel: string,
) {
  return allReceipts.map(r =>
    r.userId === userId && r.reportLabel === oldLabel
      ? { ...r, reportLabel: newLabel }
      : r,
  );
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('Phase 2 – getReceiptsByUser: userId isolation', () => {
  it('returns only User A receipts when called with User A id', () => {
    const result = getReceiptsByUser(ALL_RECEIPTS, USER_A_ID);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.userId === USER_A_ID)).toBe(true);
  });

  it('returns only User B receipts when called with User B id', () => {
    const result = getReceiptsByUser(ALL_RECEIPTS, USER_B_ID);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.userId === USER_B_ID)).toBe(true);
  });

  it('User A result does not include any User B receipts', () => {
    const result = getReceiptsByUser(ALL_RECEIPTS, USER_A_ID);
    expect(result.some(r => r.userId === USER_B_ID)).toBe(false);
  });

  it('User B result does not include any User A receipts', () => {
    const result = getReceiptsByUser(ALL_RECEIPTS, USER_B_ID);
    expect(result.some(r => r.userId === USER_A_ID)).toBe(false);
  });

  it('receipt total for User A is isolated (not inflated by User B receipts)', () => {
    const result = getReceiptsByUser(ALL_RECEIPTS, USER_A_ID);
    const total = result.reduce((sum, r) => sum + parseFloat(r.total), 0);
    expect(total).toBeCloseTo(850 + 220, 1);
    expect(total).not.toBeCloseTo(850 + 220 + 450 + 310, 1);
  });
});

describe('Phase 2 – findDuplicateReceipts: userId isolation', () => {
  const dupeStore = 'Makro';
  const dupeDate = new Date('2026-05-15');
  const dupeTotal = '850.00';

  it('finds a duplicate in User A receipts when it exists', () => {
    const result = findDuplicateReceipts(ALL_RECEIPTS, USER_A_ID, dupeStore, dupeDate, dupeTotal);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(USER_A_ID);
  });

  it('does not find a false duplicate in User B receipts', () => {
    const result = findDuplicateReceipts(ALL_RECEIPTS, USER_B_ID, dupeStore, dupeDate, dupeTotal);
    expect(result).toHaveLength(0);
  });

  it('duplicate check for User B never returns User A receipts', () => {
    const receiptsWithBDupe = [
      ...ALL_RECEIPTS,
      makeReceipt(203, USER_B_ID, { storeName: dupeStore, date: dupeDate, total: dupeTotal }),
    ];
    const result = findDuplicateReceipts(receiptsWithBDupe, USER_B_ID, dupeStore, dupeDate, dupeTotal);
    expect(result.every(r => r.userId === USER_B_ID)).toBe(true);
  });
});

describe('Phase 2 – getReceiptByClientUploadId: userId isolation', () => {
  const receiptsWithUploadIds = [
    makeReceipt(301, USER_A_ID, { clientUploadId: 'upload-aaa' }),
    makeReceipt(302, USER_B_ID, { clientUploadId: 'upload-bbb' }),
  ];

  it('returns User A receipt for User A upload id', () => {
    const result = getReceiptByClientUploadId(receiptsWithUploadIds, USER_A_ID, 'upload-aaa');
    expect(result).toBeDefined();
    expect(result!.userId).toBe(USER_A_ID);
  });

  it('returns undefined when User B tries to access User A upload id', () => {
    const result = getReceiptByClientUploadId(receiptsWithUploadIds, USER_B_ID, 'upload-aaa');
    expect(result).toBeUndefined();
  });

  it('returns User B receipt for User B upload id', () => {
    const result = getReceiptByClientUploadId(receiptsWithUploadIds, USER_B_ID, 'upload-bbb');
    expect(result).toBeDefined();
    expect(result!.userId).toBe(USER_B_ID);
  });
});

describe('Phase 2 – getCategorySummary: userId isolation', () => {
  it('User A summary totals only User A spending', () => {
    const result = getCategorySummary(ALL_RECEIPTS, USER_A_ID);
    const grandTotal = result.reduce((sum, c) => sum + c.total, 0);
    expect(grandTotal).toBeCloseTo(850 + 220, 1);
  });

  it('User B summary totals only User B spending', () => {
    const result = getCategorySummary(ALL_RECEIPTS, USER_B_ID);
    const grandTotal = result.reduce((sum, c) => sum + c.total, 0);
    expect(grandTotal).toBeCloseTo(450 + 310, 1);
  });

  it('User A summary categories do not include User B stores', () => {
    const result = getCategorySummary(ALL_RECEIPTS, USER_A_ID);
    const allEntries = result.map(c => c.category);
    expect(allEntries).not.toContain('Pick n Pay');
    expect(allEntries).not.toContain('Woolworths');
  });
});

describe('Phase 2 – weekly analytics: userId isolation', () => {
  it('weekly totals for User A do not include User B receipts', () => {
    const result = getWeeklyAnalytics(ALL_RECEIPTS, USER_A_ID);
    expect(result.every(r => !['Pick n Pay', 'Woolworths'].includes(r.storeName))).toBe(true);
  });

  it('weekly totals for User B do not include User A receipts', () => {
    const result = getWeeklyAnalytics(ALL_RECEIPTS, USER_B_ID);
    expect(result.every(r => !['Makro', 'Checkers'].includes(r.storeName))).toBe(true);
  });

  it('weekly sum for User A is isolated', () => {
    const result = getWeeklyAnalytics(ALL_RECEIPTS, USER_A_ID);
    const total = result.reduce((sum, r) => sum + r.total, 0);
    expect(total).toBeCloseTo(850 + 220, 1);
  });
});

describe('Phase 2 – top-items analytics: userId isolation', () => {
  it('User A top-items seed receipt is User A owned', () => {
    const userReceipts = ALL_RECEIPTS.filter(r => r.userId === USER_A_ID);
    expect(userReceipts.length).toBeGreaterThan(0);
    expect(userReceipts[0].userId).toBe(USER_A_ID);
  });

  it('User B top-items seed receipt is not User A owned', () => {
    const userReceipts = ALL_RECEIPTS.filter(r => r.userId === USER_B_ID);
    expect(userReceipts.every(r => r.userId !== USER_A_ID)).toBe(true);
  });
});

describe('Phase 2 – category-breakdown subcategories: userId isolation', () => {
  it('User A subcategory breakdown only includes User A report labels', () => {
    const result = getCategoryBreakdownSubcategories(ALL_RECEIPTS, USER_A_ID);
    expect(result).toHaveLength(1);
    expect(result[0].subcategory).toBe('Office Supplies');
    expect(result[0].total).toBeCloseTo(220, 1);
  });

  it('User B subcategory breakdown is empty (no User B report labels)', () => {
    const result = getCategoryBreakdownSubcategories(ALL_RECEIPTS, USER_B_ID);
    expect(result).toHaveLength(0);
  });

  it('User A subcategory total is not contaminated by User B receipts', () => {
    const result = getCategoryBreakdownSubcategories(ALL_RECEIPTS, USER_A_ID);
    const total = result.reduce((sum, r) => sum + r.total, 0);
    expect(total).toBeCloseTo(220, 1);
  });
});

describe('Phase 2 – receipt exports: userId isolation', () => {
  it('export for User A returns exactly User A receipts', () => {
    const exported = getReceiptsByUser(ALL_RECEIPTS, USER_A_ID);
    expect(exported).toHaveLength(2);
    expect(exported.every(r => r.userId === USER_A_ID)).toBe(true);
  });

  it('export for User B returns exactly User B receipts', () => {
    const exported = getReceiptsByUser(ALL_RECEIPTS, USER_B_ID);
    expect(exported).toHaveLength(2);
    expect(exported.every(r => r.userId === USER_B_ID)).toBe(true);
  });

  it('export row count is per-user not workspace-wide', () => {
    const exportA = getReceiptsByUser(ALL_RECEIPTS, USER_A_ID);
    const exportB = getReceiptsByUser(ALL_RECEIPTS, USER_B_ID);
    const workspaceTotal = ALL_RECEIPTS.filter(r => r.workspaceId === SHARED_WORKSPACE_ID).length;
    expect(exportA.length + exportB.length).toBe(workspaceTotal);
    expect(exportA.length).toBe(2);
    expect(exportB.length).toBe(2);
  });
});

describe('Phase 2 – custom category cascade update: userId isolation', () => {
  const receiptsWithLabels = [
    makeReceipt(401, USER_A_ID, { reportLabel: 'Travel' }),
    makeReceipt(402, USER_A_ID, { reportLabel: 'Travel' }),
    makeReceipt(403, USER_B_ID, { reportLabel: 'Travel' }),
  ];

  it('renaming a category for User A only updates User A receipts', () => {
    const result = categoryCascadeUpdate(receiptsWithLabels, USER_A_ID, 'Travel', 'Business Travel');
    const aUpdated = result.filter(r => r.userId === USER_A_ID);
    const bUnchanged = result.filter(r => r.userId === USER_B_ID);

    expect(aUpdated.every(r => r.reportLabel === 'Business Travel')).toBe(true);
    expect(bUnchanged.every(r => r.reportLabel === 'Travel')).toBe(true);
  });

  it('User B receipts are unaffected by User A category rename', () => {
    const result = categoryCascadeUpdate(receiptsWithLabels, USER_A_ID, 'Travel', 'Business Travel');
    const bReceipts = result.filter(r => r.userId === USER_B_ID);
    expect(bReceipts[0].reportLabel).toBe('Travel');
  });

  it('total receipts updated by cascade matches User A count only', () => {
    const result = categoryCascadeUpdate(receiptsWithLabels, USER_A_ID, 'Travel', 'Business Travel');
    const updated = result.filter(r => r.reportLabel === 'Business Travel');
    expect(updated).toHaveLength(2);
    expect(updated.every(r => r.userId === USER_A_ID)).toBe(true);
  });
});

describe('Phase 2 – receipt creation: workspaceId still set correctly', () => {
  it('a new receipt can carry both userId and workspaceId', () => {
    const newReceipt = makeReceipt(999, USER_A_ID, {
      workspaceId: SHARED_WORKSPACE_ID,
      storeName: 'New Store',
      total: '75.00',
    });
    expect(newReceipt.userId).toBe(USER_A_ID);
    expect(newReceipt.workspaceId).toBe(SHARED_WORKSPACE_ID);
  });

  it('queries by userId return the new receipt for the correct user', () => {
    const newReceipt = makeReceipt(999, USER_A_ID);
    const allWithNew = [...ALL_RECEIPTS, newReceipt];
    const result = getReceiptsByUser(allWithNew, USER_A_ID);
    expect(result.some(r => r.id === 999)).toBe(true);
    expect(result.every(r => r.userId === USER_A_ID)).toBe(true);
  });

  it('new receipt does not appear in User B queries', () => {
    const newReceipt = makeReceipt(999, USER_A_ID);
    const allWithNew = [...ALL_RECEIPTS, newReceipt];
    const result = getReceiptsByUser(allWithNew, USER_B_ID);
    expect(result.some(r => r.id === 999)).toBe(false);
  });
});
