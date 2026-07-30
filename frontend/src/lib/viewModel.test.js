import { describe, it, expect } from "vitest";
import {
  mapReportingSummary,
  resolveRequiredReturningCheckinFields,
} from "./viewModel";

describe("mapReportingSummary", () => {
  it("maps backend snake_case visitor_types into the frontend visitorTypes view model", () => {
    const summary = { visitor_types: [{ label: "Guest", count: 3 }] };
    const report = mapReportingSummary(summary);
    expect(report.visitorTypes).toEqual([{ label: "Guest", count: 3 }]);
  });

  it("defaults every section to an empty array when the summary is null/undefined", () => {
    const report = mapReportingSummary(null);
    expect(report.visitorTypes).toEqual([]);
    expect(report.check_ins_by_location).toEqual([]);
    expect(report.recent_arrivals).toEqual([]);
    expect(report.hourly_activity).toEqual([]);
    expect(report.daily_trends).toEqual([]);
    expect(report.print_station_usage).toEqual([]);
    expect(report.peak_check_in_times).toEqual([]);
  });

  it("does not read a camelCase visitorTypes field from the backend payload (F-006 guard)", () => {
    // If the backend field name ever drifts, the mapping must NOT silently pass
    // stale data through under the wrong key.
    const summary = { visitorTypes: [{ label: "Guest", count: 9 }] };
    const report = mapReportingSummary(summary);
    expect(report.visitorTypes).toEqual([]);
  });
});

describe("resolveRequiredReturningCheckinFields", () => {
  const fallback = ["first_name", "last_name"];

  it("uses the backend snake_case required_returning_checkin_fields when present", () => {
    const settings = { required_returning_checkin_fields: ["phone"] };
    expect(resolveRequiredReturningCheckinFields(settings, fallback)).toEqual([
      "phone",
    ]);
  });

  it("falls back to the default when the setting is absent", () => {
    expect(resolveRequiredReturningCheckinFields({}, fallback)).toBe(fallback);
    expect(resolveRequiredReturningCheckinFields(null, fallback)).toBe(fallback);
  });

  it("ignores a camelCase field (F-015 regression guard)", () => {
    const settings = { requiredReturningCheckinFields: ["phone"] };
    expect(resolveRequiredReturningCheckinFields(settings, fallback)).toBe(
      fallback
    );
  });
});
