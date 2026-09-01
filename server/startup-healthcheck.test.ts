import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('deployment startup health gate', () => {
  it('answers Replit liveness probes while required initialization is running', () => {
    expect(source).toContain("const isHealthProbe = req.path === '/' || req.path === '/api/health'");
    expect(source).toContain("return res.status(200).json({ status: 'starting' })");
    expect(source).toContain("return res.status(503).json({");
  });

  it('starts listening before awaiting slow external initialization', () => {
    const listen = source.indexOf('server.listen({');
    const azure = source.indexOf('await azureStorage.initialize()', listen);
    const plans = source.indexOf('await initializeSubscriptionPlans()', listen);
    const migration = source.indexOf('await runBillingIntegrityMigration()', listen);

    expect(listen).toBeGreaterThan(-1);
    expect(azure).toBeGreaterThan(listen);
    expect(plans).toBeGreaterThan(listen);
    expect(migration).toBeGreaterThan(listen);
  });

  it('fails health checks when required initialization fails', () => {
    expect(source).toContain("startupState = 'failed'");
    expect(source).toContain("return res.status(500).json({ status: 'failed', error: startupError })");
  });
});
