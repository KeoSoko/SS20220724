import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const planSeederSource = readFileSync(new URL('./subscription-plans-seeder.ts', import.meta.url), 'utf8');
const routesSource = readFileSync(new URL('./routes.ts', import.meta.url), 'utf8');
const databaseStorageSource = readFileSync(new URL('./database-storage.ts', import.meta.url), 'utf8');

describe('deployment startup health gate', () => {
  it('answers Replit liveness probes while required initialization is running', () => {
    expect(source).toContain("const isHealthProbe = req.path === '/' || req.path === '/api/health'");
    expect(source).toContain("return res.status(200).json({ status: 'starting' })");
    expect(source).toContain("return res.status(503).json({");
  });

  it('starts listening before awaiting slow external initialization', () => {
    const listen = source.indexOf('server.listen({');
    const azure = source.indexOf('await azureStorage.initialize()', listen);
    const database = source.indexOf('await initializeDatabase()', azure);
    const plans = source.indexOf('await initializeSubscriptionPlans()', listen);
    const migration = source.indexOf('await runBillingIntegrityMigration()', listen);

    expect(listen).toBeGreaterThan(-1);
    expect(azure).toBeGreaterThan(listen);
    expect(database).toBeGreaterThan(azure);
    expect(plans).toBeGreaterThan(database);
    expect(migration).toBeGreaterThan(plans);
  });

  it('awaits the retrying database probe before billing initialization', () => {
    expect(source).toContain('const databaseReady = await initializeDatabase()');
    expect(source).toContain('if (!databaseReady)');
    expect(source).toContain('Database connection failed after startup retries');
  });

  it('does not start a competing database probe from the storage constructor', () => {
    expect(databaseStorageSource).not.toContain('this.initialize().catch');
  });

  it('fails health checks when required initialization fails', () => {
    expect(source).toContain("startupState = 'failed'");
    expect(source).toContain("return res.status(500).json({ status: 'failed', error: startupError })");
  });

  it('starts database-backed workers only after required initialization is ready', () => {
    const migration = source.indexOf('await runBillingIntegrityMigration()');
    const ready = source.indexOf("startupState = 'ready'", migration);
    expect(source.indexOf("['subscription background workers'", ready)).toBeGreaterThan(ready);
    expect(source.indexOf("['deferred Paystack webhook replay'", ready)).toBeGreaterThan(ready);
    expect(source.indexOf("['background export worker'", ready)).toBeGreaterThan(ready);
  });

  it('does not start recurring work while plans or routes are initialized', () => {
    const planInitialization = planSeederSource.slice(
      planSeederSource.indexOf('export async function initializeSubscriptionPlans'),
      planSeederSource.indexOf('export function startSubscriptionBackgroundWorkers'),
    );
    expect(planInitialization).not.toContain('startOrphanedPaymentMonitoring');
    expect(planInitialization).not.toContain('startTierMigrationMonitoring');
    expect(routesSource).not.toContain('\n  startDeferredPaystackWebhookReplay();\n  const httpServer');
  });
});
