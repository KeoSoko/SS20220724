import { describe, it, expect } from 'vitest';

// ─── SCENARIO ────────────────────────────────────────────────────────────────
// User A and User B are members of the SAME billing group (same workspaceId).
// After Phase 3, every Business Hub query (clients / quotations / invoices)
// must filter by userId, NOT workspaceId.
// These tests prove each ownership-check helper returns only the calling
// user's data, and that INSERT fixtures still carry workspaceId for schema
// compliance.

const USER_A_ID = 1;
const USER_B_ID = 2;
const SHARED_WORKSPACE_ID = 100;

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const makeClient = (id: number, userId: number, overrides: Record<string, any> = {}) => ({
  id,
  userId,
  workspaceId: SHARED_WORKSPACE_ID,
  name: `Client ${id}`,
  email: `client${id}@example.com`,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeQuotation = (id: number, userId: number, overrides: Record<string, any> = {}) => ({
  id,
  userId,
  workspaceId: SHARED_WORKSPACE_ID,
  clientId: id * 10,
  quotationNumber: `QUO-2026-00${id}`,
  status: 'draft',
  total: '500.00',
  isActive: true,
  date: new Date('2026-05-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeInvoice = (id: number, userId: number, overrides: Record<string, any> = {}) => ({
  id,
  userId,
  workspaceId: SHARED_WORKSPACE_ID,
  clientId: id * 10,
  invoiceNumber: `INV-2026-00${id}`,
  status: 'unpaid',
  total: '1000.00',
  amountPaid: '0.00',
  isActive: true,
  date: new Date('2026-05-01'),
  dueDate: new Date('2026-06-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const CLIENT_A1 = makeClient(1, USER_A_ID, { name: 'Acme Corp' });
const CLIENT_A2 = makeClient(2, USER_A_ID, { name: 'Beta Ltd' });
const CLIENT_B1 = makeClient(3, USER_B_ID, { name: 'Gamma Inc' });
const CLIENT_B2 = makeClient(4, USER_B_ID, { name: 'Delta Pty' });

const QUOTATION_A1 = makeQuotation(1, USER_A_ID, { total: '3000.00' });
const QUOTATION_A2 = makeQuotation(2, USER_A_ID, { status: 'sent', total: '7500.00' });
const QUOTATION_B1 = makeQuotation(3, USER_B_ID, { total: '1200.00' });
const QUOTATION_B2 = makeQuotation(4, USER_B_ID, { status: 'accepted', total: '9800.00' });

const INVOICE_A1 = makeInvoice(1, USER_A_ID, { total: '5000.00', amountPaid: '2000.00', status: 'partially_paid' });
const INVOICE_A2 = makeInvoice(2, USER_A_ID, { total: '800.00', status: 'paid', amountPaid: '800.00' });
const INVOICE_B1 = makeInvoice(3, USER_B_ID, { total: '15000.00', status: 'unpaid' });
const INVOICE_B2 = makeInvoice(4, USER_B_ID, { total: '3300.00', status: 'overdue' });

const ALL_CLIENTS    = [CLIENT_A1, CLIENT_A2, CLIENT_B1, CLIENT_B2];
const ALL_QUOTATIONS = [QUOTATION_A1, QUOTATION_A2, QUOTATION_B1, QUOTATION_B2];
const ALL_INVOICES   = [INVOICE_A1, INVOICE_A2, INVOICE_B1, INVOICE_B2];

// ─── PURE HELPER FUNCTIONS ────────────────────────────────────────────────────
// These mirror the Phase 3 logic extracted from routes.ts.
// No external dependencies — deterministic, no mocks needed.

function listClients(all: typeof ALL_CLIENTS, userId: number) {
  return all.filter(c => c.userId === userId && c.isActive);
}

function getClient(all: typeof ALL_CLIENTS, userId: number, clientId: number) {
  return all.find(c => c.id === clientId && c.userId === userId) ?? null;
}

function listQuotations(all: typeof ALL_QUOTATIONS, userId: number) {
  return all.filter(q => q.userId === userId && q.isActive);
}

function getQuotation(all: typeof ALL_QUOTATIONS, userId: number, quotationId: number) {
  return all.find(q => q.id === quotationId && q.userId === userId) ?? null;
}

function listInvoices(all: typeof ALL_INVOICES, userId: number) {
  return all.filter(i => i.userId === userId && i.isActive);
}

function getInvoice(all: typeof ALL_INVOICES, userId: number, invoiceId: number) {
  return all.find(i => i.id === invoiceId && i.userId === userId) ?? null;
}

function getInvoiceStats(all: typeof ALL_INVOICES, userId: number) {
  const userInvoices = all.filter(i => i.userId === userId);
  let totalUnpaid = 0;
  let totalOverdue = 0;
  let overdueCount = 0;
  for (const inv of userInvoices) {
    const total = parseFloat(inv.total);
    const paid  = parseFloat(inv.amountPaid);
    const remaining = total - paid;
    if (['unpaid', 'partially_paid', 'overdue'].includes(inv.status)) {
      totalUnpaid += remaining;
    }
    if (inv.status === 'overdue') {
      totalOverdue += remaining;
      overdueCount++;
    }
  }
  return { totalUnpaid, totalOverdue, overdueCount, invoiceCount: userInvoices.length };
}

/** Simulate sequential numbering per-user (not per-workspace). */
function nextInvoiceNumber(all: typeof ALL_INVOICES, userId: number, year: number): string {
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year + 1, 0, 1);
  const userInvoicesThisYear = all.filter(
    i => i.userId === userId && i.date >= yearStart && i.date < yearEnd,
  );
  let maxSeq = 0;
  for (const inv of userInvoicesThisYear) {
    const parts = inv.invoiceNumber.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `INV-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

function nextQuotationNumber(all: typeof ALL_QUOTATIONS, userId: number, year: number): string {
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year + 1, 0, 1);
  const userQuotesThisYear = all.filter(
    q => q.userId === userId && q.date >= yearStart && q.date < yearEnd,
  );
  let maxSeq = 0;
  for (const q of userQuotesThisYear) {
    const parts = q.quotationNumber.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `QUO-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe('Phase 3 – Business Hub isolation by userId', () => {

  // ── Clients ──────────────────────────────────────────────────────────────

  describe('Client list isolation', () => {
    it('User A only sees their own active clients', () => {
      const result = listClients(ALL_CLIENTS, USER_A_ID);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual([CLIENT_A1.id, CLIENT_A2.id]);
    });

    it('User B only sees their own active clients', () => {
      const result = listClients(ALL_CLIENTS, USER_B_ID);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual([CLIENT_B1.id, CLIENT_B2.id]);
    });

    it('Clients are cross-isolated — no bleed between users in same workspace', () => {
      const a = listClients(ALL_CLIENTS, USER_A_ID);
      const b = listClients(ALL_CLIENTS, USER_B_ID);
      const aIds = new Set(a.map(c => c.id));
      for (const c of b) expect(aIds.has(c.id)).toBe(false);
    });
  });

  describe('Client ownership check (GET /:id)', () => {
    it('User A can fetch their own client', () => {
      expect(getClient(ALL_CLIENTS, USER_A_ID, CLIENT_A1.id)).not.toBeNull();
    });

    it('User A cannot fetch User B\'s client', () => {
      expect(getClient(ALL_CLIENTS, USER_A_ID, CLIENT_B1.id)).toBeNull();
    });

    it('User B cannot fetch User A\'s client', () => {
      expect(getClient(ALL_CLIENTS, USER_B_ID, CLIENT_A2.id)).toBeNull();
    });
  });

  // ── Quotations ───────────────────────────────────────────────────────────

  describe('Quotation list isolation', () => {
    it('User A only sees their own quotations', () => {
      const result = listQuotations(ALL_QUOTATIONS, USER_A_ID);
      expect(result).toHaveLength(2);
      expect(result.map(q => q.id)).toEqual([QUOTATION_A1.id, QUOTATION_A2.id]);
    });

    it('User B only sees their own quotations', () => {
      const result = listQuotations(ALL_QUOTATIONS, USER_B_ID);
      expect(result).toHaveLength(2);
      expect(result.map(q => q.id)).toEqual([QUOTATION_B1.id, QUOTATION_B2.id]);
    });

    it('Quotations are cross-isolated — no bleed between users in same workspace', () => {
      const a = listQuotations(ALL_QUOTATIONS, USER_A_ID);
      const b = listQuotations(ALL_QUOTATIONS, USER_B_ID);
      const aIds = new Set(a.map(q => q.id));
      for (const q of b) expect(aIds.has(q.id)).toBe(false);
    });
  });

  describe('Quotation ownership check (GET /:id)', () => {
    it('User A can fetch their own quotation', () => {
      expect(getQuotation(ALL_QUOTATIONS, USER_A_ID, QUOTATION_A1.id)).not.toBeNull();
    });

    it('User A cannot fetch User B\'s quotation', () => {
      expect(getQuotation(ALL_QUOTATIONS, USER_A_ID, QUOTATION_B1.id)).toBeNull();
    });

    it('User B cannot fetch User A\'s quotation', () => {
      expect(getQuotation(ALL_QUOTATIONS, USER_B_ID, QUOTATION_A2.id)).toBeNull();
    });
  });

  // ── Invoices ─────────────────────────────────────────────────────────────

  describe('Invoice list isolation', () => {
    it('User A only sees their own invoices', () => {
      const result = listInvoices(ALL_INVOICES, USER_A_ID);
      expect(result).toHaveLength(2);
      expect(result.map(i => i.id)).toEqual([INVOICE_A1.id, INVOICE_A2.id]);
    });

    it('User B only sees their own invoices', () => {
      const result = listInvoices(ALL_INVOICES, USER_B_ID);
      expect(result).toHaveLength(2);
      expect(result.map(i => i.id)).toEqual([INVOICE_B1.id, INVOICE_B2.id]);
    });

    it('Invoices are cross-isolated — no bleed between users in same workspace', () => {
      const a = listInvoices(ALL_INVOICES, USER_A_ID);
      const b = listInvoices(ALL_INVOICES, USER_B_ID);
      const aIds = new Set(a.map(i => i.id));
      for (const inv of b) expect(aIds.has(inv.id)).toBe(false);
    });
  });

  describe('Invoice ownership check (GET /:id)', () => {
    it('User A can fetch their own invoice', () => {
      expect(getInvoice(ALL_INVOICES, USER_A_ID, INVOICE_A1.id)).not.toBeNull();
    });

    it('User A cannot fetch User B\'s invoice', () => {
      expect(getInvoice(ALL_INVOICES, USER_A_ID, INVOICE_B1.id)).toBeNull();
    });

    it('User B cannot fetch User A\'s invoice', () => {
      expect(getInvoice(ALL_INVOICES, USER_B_ID, INVOICE_A2.id)).toBeNull();
    });
  });

  // ── Invoice stats ─────────────────────────────────────────────────────────

  describe('Invoice stats are user-scoped', () => {
    it('User A stats reflect only their invoices', () => {
      const stats = getInvoiceStats(ALL_INVOICES, USER_A_ID);
      // A1: partially_paid, total 5000, paid 2000 → 3000 unpaid
      // A2: paid → 0 unpaid
      expect(stats.invoiceCount).toBe(2);
      expect(stats.totalUnpaid).toBeCloseTo(3000, 2);
      expect(stats.totalOverdue).toBe(0);
      expect(stats.overdueCount).toBe(0);
    });

    it('User B stats reflect only their invoices', () => {
      const stats = getInvoiceStats(ALL_INVOICES, USER_B_ID);
      // B1: unpaid 15000, B2: overdue 3300
      expect(stats.invoiceCount).toBe(2);
      expect(stats.totalUnpaid).toBeCloseTo(18300, 2);
      expect(stats.totalOverdue).toBeCloseTo(3300, 2);
      expect(stats.overdueCount).toBe(1);
    });

    it('User A stats are unaffected by User B\'s overdue invoices', () => {
      const statsA = getInvoiceStats(ALL_INVOICES, USER_A_ID);
      const statsB = getInvoiceStats(ALL_INVOICES, USER_B_ID);
      expect(statsA.overdueCount).toBe(0);
      expect(statsB.overdueCount).toBe(1);
    });
  });

  // ── Sequential numbering scoped per-user ──────────────────────────────────

  describe('Invoice sequential numbering is per-user', () => {
    it('User A next invoice number follows their own sequence', () => {
      // A has INV-2026-001 and INV-2026-002
      const next = nextInvoiceNumber(ALL_INVOICES, USER_A_ID, 2026);
      expect(next).toBe('INV-2026-003');
    });

    it('User B next invoice number follows their own sequence', () => {
      // B has INV-2026-003 and INV-2026-004 → next is 005
      const next = nextInvoiceNumber(ALL_INVOICES, USER_B_ID, 2026);
      expect(next).toBe('INV-2026-005');
    });

    it('User A and User B sequences are independent', () => {
      const nextA = nextInvoiceNumber(ALL_INVOICES, USER_A_ID, 2026);
      const nextB = nextInvoiceNumber(ALL_INVOICES, USER_B_ID, 2026);
      expect(nextA).not.toBe(nextB);
    });

    it('New year resets sequence independently per user', () => {
      const nextA = nextInvoiceNumber(ALL_INVOICES, USER_A_ID, 2027);
      const nextB = nextInvoiceNumber(ALL_INVOICES, USER_B_ID, 2027);
      expect(nextA).toBe('INV-2027-001');
      expect(nextB).toBe('INV-2027-001');
    });
  });

  describe('Quotation sequential numbering is per-user', () => {
    it('User A next quotation number follows their own sequence', () => {
      const next = nextQuotationNumber(ALL_QUOTATIONS, USER_A_ID, 2026);
      expect(next).toBe('QUO-2026-003');
    });

    it('User B next quotation number follows their own sequence', () => {
      const next = nextQuotationNumber(ALL_QUOTATIONS, USER_B_ID, 2026);
      expect(next).toBe('QUO-2026-005');
    });
  });

  // ── INSERT fixtures still carry workspaceId ───────────────────────────────

  describe('INSERT fixtures retain workspaceId for schema compliance', () => {
    it('All client fixtures have a workspaceId', () => {
      for (const c of ALL_CLIENTS) {
        expect(c.workspaceId).toBe(SHARED_WORKSPACE_ID);
      }
    });

    it('All quotation fixtures have a workspaceId', () => {
      for (const q of ALL_QUOTATIONS) {
        expect(q.workspaceId).toBe(SHARED_WORKSPACE_ID);
      }
    });

    it('All invoice fixtures have a workspaceId', () => {
      for (const i of ALL_INVOICES) {
        expect(i.workspaceId).toBe(SHARED_WORKSPACE_ID);
      }
    });

    it('Same workspaceId does NOT collapse isolation — users still see different data', () => {
      const a = listClients(ALL_CLIENTS, USER_A_ID);
      const b = listClients(ALL_CLIENTS, USER_B_ID);
      // Both share the same workspace but see different clients
      expect(a.every(c => c.workspaceId === SHARED_WORKSPACE_ID)).toBe(true);
      expect(b.every(c => c.workspaceId === SHARED_WORKSPACE_ID)).toBe(true);
      const aIds = new Set(a.map(c => c.id));
      for (const c of b) expect(aIds.has(c.id)).toBe(false);
    });
  });

  // ── Cross-entity isolation ────────────────────────────────────────────────

  describe('Cross-entity isolation within same workspace', () => {
    it('User A has no overlap with User B across all entity types', () => {
      const aClientIds    = new Set(listClients(ALL_CLIENTS, USER_A_ID).map(c => c.id));
      const aQuoteIds     = new Set(listQuotations(ALL_QUOTATIONS, USER_A_ID).map(q => q.id));
      const aInvoiceIds   = new Set(listInvoices(ALL_INVOICES, USER_A_ID).map(i => i.id));

      for (const c of listClients(ALL_CLIENTS, USER_B_ID))       expect(aClientIds.has(c.id)).toBe(false);
      for (const q of listQuotations(ALL_QUOTATIONS, USER_B_ID)) expect(aQuoteIds.has(q.id)).toBe(false);
      for (const i of listInvoices(ALL_INVOICES, USER_B_ID))     expect(aInvoiceIds.has(i.id)).toBe(false);
    });
  });

});
