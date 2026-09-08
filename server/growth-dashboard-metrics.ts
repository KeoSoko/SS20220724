export const GROWTH_TIMEZONES = ["Africa/Johannesburg", "UTC", "Europe/London", "America/New_York"] as const;
export type GrowthTimezone = typeof GROWTH_TIMEZONES[number];
export type GrowthCohort = "all" | "attributed" | "unattributed";
export const GROWTH_BASELINE_DATE = "2026-09-08";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function growthPercent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

export function parseGrowthDashboardInput(query: Record<string, unknown>, now = new Date()):
  | { from: string; to: string; timezone: GrowthTimezone; cohort: GrowthCohort }
  | { error: string } {
  const toDefault = now.toISOString().slice(0, 10);
  const fromDefault = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = typeof query.from === "string" ? query.from : fromDefault;
  const to = typeof query.to === "string" ? query.to : toDefault;
  const isRealIsoDate = (value: string) =>
    ISO_DATE.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
    return { error: "from and to must be ISO dates (YYYY-MM-DD)" };
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (span < 1 || span > 366) return { error: "from/to range must be ordered and no more than 366 days inclusive" };
  if (query.timezone !== undefined && !GROWTH_TIMEZONES.includes(query.timezone as GrowthTimezone)) return { error: "Unsupported timezone" };
  const timezone = (query.timezone as GrowthTimezone | undefined) ?? "Africa/Johannesburg";
  const cohort: GrowthCohort = query.cohort === "attributed" || query.cohort === "unattributed" ? query.cohort : "all";
  if (query.cohort !== undefined && cohort === "all" && query.cohort !== "all") return { error: "Unsupported cohort" };
  return { from, to, timezone, cohort };
}

export function isRetentionMature(signupLocalDate: string, effectiveReportEndLocalDate: string, day: 1 | 7 | 30) {
  const signup = Date.parse(`${signupLocalDate}T00:00:00Z`);
  const reportEnd = Date.parse(`${effectiveReportEndLocalDate}T00:00:00Z`);
  return Number.isFinite(signup) && Number.isFinite(reportEnd) && signup <= reportEnd - day * 86_400_000;
}