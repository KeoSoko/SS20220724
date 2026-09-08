import { describe, expect, it } from "vitest";
import {
  GROWTH_BASELINE_DATE,
  growthPercent,
  isRetentionMature,
  parseGrowthDashboardInput,
} from "./growth-dashboard-metrics";

describe("growth dashboard metric boundaries", () => {
  it("uses deterministic percentages and mature retention cohorts", () => {
    expect(growthPercent(2, 8)).toBe(25);
    expect(growthPercent(1, 3)).toBe(33.33);
    expect(isRetentionMature("2026-09-01", "2026-09-08", 7)).toBe(true);
    expect(isRetentionMature("2026-09-02", "2026-09-08", 7)).toBe(false);
    expect(isRetentionMature("2026-08-09", "2026-09-08", 30)).toBe(true);
  });

  it("defaults to 30 days and enforces date, timezone, cohort, and max-range bounds", () => {
    expect(parseGrowthDashboardInput({}, new Date("2026-09-08T12:00:00Z"))).toEqual({
      from: "2026-08-10",
      to: "2026-09-08",
      timezone: "Africa/Johannesburg",
      cohort: "all",
    });
    expect(parseGrowthDashboardInput({ from: "2026-09-08", to: "2026-09-01" })).toHaveProperty("error");
    expect(parseGrowthDashboardInput({ from: "2026-02-30", to: "2026-03-01" })).toHaveProperty("error");
    expect(parseGrowthDashboardInput({ from: "2025-01-01", to: "2026-09-08" })).toHaveProperty("error");
    expect(parseGrowthDashboardInput({ timezone: "Mars/Olympus" })).toHaveProperty("error");
    expect(parseGrowthDashboardInput({ cohort: "customers" })).toHaveProperty("error");
  });

  it("publishes an explicit instrumentation baseline", () => {
    expect(GROWTH_BASELINE_DATE).toBe("2026-09-08");
  });
});