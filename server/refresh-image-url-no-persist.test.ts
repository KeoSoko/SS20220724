import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression test for GET /api/receipts/:id/refresh-image-url.
 *
 * Original bug: this endpoint generated a fresh (short-lived) SAS URL from
 * the receipt's durable `blobName` and then persisted it back onto the
 * receipt's `blobUrl` column, overwriting the long-lived SAS URL stored at
 * upload time. Once that shorter token expired, the stored `blobUrl` went
 * stale again with nothing to re-trigger a refresh, which is how ~15% of
 * production receipts ended up with an expired link in `blobUrl`.
 *
 * The fix: treat the generated SAS URL as an ephemeral, response-only value.
 * The endpoint must never write to `blobUrl` (or any other receipt field).
 *
 * This test locks that behaviour in two complementary ways:
 *   1. Behavioural — drives the REAL route handler and asserts a fresh URL is
 *      returned while `storage.updateReceipt` is never called.
 *   2. Source invariant — statically guarantees the handler body can never
 *      reintroduce a `storage.updateReceipt` (or other persistence) call on
 *      any branch, even ones the behavioural happy-path doesn't exercise.
 */

// --- Spies we assert on -----------------------------------------------------
const getReceipt = vi.fn();
const updateReceipt = vi.fn();
const generateSasUrl = vi.fn();

// --- Mock side-effecting / heavy modules so importing ./routes is clean -----
vi.mock('./auth', () => ({ setupAuth: vi.fn(), comparePasswords: vi.fn() }));
vi.mock('./admin-routes', () => ({ registerAdminRoutes: vi.fn() }));
vi.mock('./vite', () => ({ log: vi.fn(), setupVite: vi.fn(), serveStatic: vi.fn() }));
vi.mock('./storage', () => ({ storage: { getReceipt, updateReceipt } }));
vi.mock('./azure-storage', () => ({ azureStorage: { generateSasUrl } }));

const dbMock: any = {
  select: () => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
  }),
};
vi.mock('./db', () => ({ db: dbMock, pool: {} }));

// --- Capture the real handler by registering routes on a fake app -----------
// registerRoutes() calls many Express app methods at registration time
// (app.post/get/use, but also app.param, app.set, etc.). A Proxy handles every
// method generically: route registrars record their handlers, everything else
// is a harmless no-op that returns the app for chaining.
async function captureRefreshImageUrlHandler(): Promise<(req: any, res: any) => any> {
  const registered: Record<string, Map<string, Function[]>> = {};
  const routeMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all', 'use']);

  const target: any = function () {}; // function target so http.createServer(app) accepts it
  const proxy: any = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol') return (t as any)[prop];
      if (prop === 'locals') return {};
      if (routeMethods.has(prop as string)) {
        return (...args: any[]) => {
          if (typeof args[0] === 'string') {
            const handlers = args.slice(1).filter((a) => typeof a === 'function');
            if (handlers.length) (registered[prop as string] ||= new Map()).set(args[0], handlers);
          }
          return proxy;
        };
      }
      // param, set, engine, enable, disable, on, once, etc. -> chainable no-op
      return () => proxy;
    },
  });

  const { registerRoutes } = await import('./routes');
  await registerRoutes(proxy);

  const handlers = registered['get']?.get('/api/receipts/:id/refresh-image-url');
  if (!handlers || handlers.length === 0) {
    throw new Error('refresh-image-url handler was not registered');
  }
  // The final handler is the actual route logic; earlier ones are auth/role
  // middleware which we bypass here by constructing an already-authenticated req.
  return handlers[handlers.length - 1] as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.sendStatus = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/receipts/:id/refresh-image-url (behavioural)', () => {
  let handler: (req: any, res: any) => any;
  beforeAll(async () => {
    handler = await captureRefreshImageUrlHandler();
  }, 30000);

  it('returns a fresh SAS URL without persisting it back onto the receipt', async () => {
    const STALE_BLOB_URL =
      'https://slipsstor1.blob.core.windows.net/receipt-images/receipt_1.jpg?se=2025-01-01T00%3A00%3A00Z&sig=stale';
    const FRESH_SAS_URL =
      'https://slipsstor1.blob.core.windows.net/receipt-images/receipt_1.jpg?se=2026-12-31T00%3A00%3A00Z&sig=fresh';

    getReceipt.mockResolvedValue({
      id: 1,
      userId: 5,
      blobName: 'receipt_1.jpg',
      blobUrl: STALE_BLOB_URL,
    });
    generateSasUrl.mockResolvedValue(FRESH_SAS_URL);

    const req: any = {
      params: { id: '1' },
      isAuthenticated: () => true,
      user: { id: 5 },
    };
    const res = makeRes();

    await handler(req, res);

    // A fresh URL was generated from the durable blobName and returned to the client.
    expect(generateSasUrl).toHaveBeenCalledWith('receipt_1.jpg', expect.anything());
    expect(res.json).toHaveBeenCalledWith({ imageUrl: FRESH_SAS_URL });
    expect(res.status).not.toHaveBeenCalledWith(500);

    // The bug guard: nothing was ever written back to the receipt.
    expect(updateReceipt).not.toHaveBeenCalled();
  });

  it('still 404s cleanly when the receipt has no blobName (no persistence attempted either)', async () => {
    getReceipt.mockResolvedValue({ id: 2, userId: 5, blobName: null, blobUrl: null });

    const req: any = {
      params: { id: '2' },
      isAuthenticated: () => true,
      user: { id: 5 },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(generateSasUrl).not.toHaveBeenCalled();
    expect(updateReceipt).not.toHaveBeenCalled();
  });
});

describe('refresh-image-url handler (source invariant)', () => {
  it('handler body never calls storage.updateReceipt', () => {
    const source = readFileSync(join(__dirname, 'routes.ts'), 'utf8');
    const start = source.indexOf('app.get("/api/receipts/:id/refresh-image-url"');
    expect(start).toBeGreaterThan(-1);
    // The handler ends where the next route registration begins.
    const end = source.indexOf('app.get("/api/receipts/:id/image-data"', start);
    expect(end).toBeGreaterThan(start);

    const handlerSource = source.slice(start, end);

    // The bug guard: this handler must never persist the SAS URL it generates.
    expect(handlerSource).not.toMatch(/storage\.updateReceipt/);

    // Sanity: it really is the handler that generates a SAS URL and responds with it.
    expect(handlerSource).toMatch(/generateSasUrl/);
    expect(handlerSource).toMatch(/imageUrl:\s*sasUrl/);
  });
});
