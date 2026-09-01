import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminRoutes = readFileSync(new URL('./admin-routes.ts', import.meta.url), 'utf8');
const commandCenter = readFileSync(new URL('../client/src/pages/command-center.tsx', import.meta.url), 'utf8');

describe('recent expired trial dashboard', () => {
  it('counts current trial subscriptions that expired within the last 30 days', () => {
    expect(adminRoutes).toContain("eq(userSubscriptions.status, 'trial')");
    expect(adminRoutes).toContain('gte(userSubscriptions.trialEndDate, thirtyDaysAgo)');
    expect(adminRoutes).toContain('lt(userSubscriptions.trialEndDate, now)');
    expect(adminRoutes).not.toContain('lt(users.trialEndDate, thirtyDaysAgo)');
  });

  it('uses the same subscription-backed definition for the drill-down list', () => {
    const start = adminRoutes.indexOf("case 'stuck_trials':");
    const end = adminRoutes.indexOf("case 'failed_24h':", start);
    const block = adminRoutes.slice(start, end);

    expect(block).toContain('.innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))');
    expect(block).toContain('trialEndDate: userSubscriptions.trialEndDate');
    expect(block).toContain('.orderBy(desc(userSubscriptions.trialEndDate))');
  });

  it('does not present expired-trial history as urgent churn or payment failure', () => {
    expect(commandCenter).toContain("'stuck_trials': 'Recent Expired Trials'");
    expect(commandCenter).toContain("'stuck_trials': 'Ended in last 30 days'");
    expect(commandCenter).not.toContain('users likely to churn today');
    expect(commandCenter).not.toContain('Payment failures and stuck trials need urgent attention');
    expect(commandCenter).toContain('{health.failedSubscriptions24h > 0 && (');
  });
});
