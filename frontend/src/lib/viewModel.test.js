import { describe, it, expect } from "vitest";
import {
  mapReportingSummary,
  resolveRequiredReturningCheckinFields,
  buildVisitorUpdatePayload,
  formatCameraLabel,
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

describe("buildVisitorUpdatePayload", () => {
  it("carries the edited notes from the same object the form binds to (D2 regression guard)", () => {
    const edited = {
      id: 7,
      first_name: "Sam",
      last_name: "Rivera",
      visitor_type: "Parent",
      purpose: "Visiting Camper",
      host_name: "Alex Rivera",
      vehicle_plate: "ABC123",
      phone: "555-0100",
      email: "sam@example.com",
      notes: "Allergic to peanuts",
      expected_departure_time: null,
    };
    const payload = buildVisitorUpdatePayload(edited);
    expect(payload.notes).toBe("Allergic to peanuts");
    expect(payload).toEqual({
      first_name: "Sam",
      last_name: "Rivera",
      visitor_type: "Parent",
      purpose: "Visiting Camper",
      host_name: "Alex Rivera",
      vehicle_plate: "ABC123",
      phone: "555-0100",
      email: "sam@example.com",
      notes: "Allergic to peanuts",
      expected_departure_time: null,
    });
  });

  it("defaults missing fields so a partial visitor never sends undefined", () => {
    const payload = buildVisitorUpdatePayload({ id: 1, notes: "keep me" });
    expect(payload.notes).toBe("keep me");
    expect(payload.first_name).toBe("");
    expect(payload.expected_departure_time).toBeNull();
  });
});

describe("formatCameraLabel", () => {
  it("normalizes Android 'facing back/front' labels to friendly names (D1/D3/D4)", () => {
    expect(formatCameraLabel("camera2 0, facing back")).toBe("Back Camera");
    expect(formatCameraLabel("camera 1, facing front")).toBe("Front Camera");
  });

  it("passes through iPad/desktop friendly labels unchanged", () => {
    expect(formatCameraLabel("Front Ultra Wide Camera")).toBe(
      "Front Ultra Wide Camera"
    );
    expect(formatCameraLabel("Surface Camera Front (045e:0c85)")).toBe(
      "Surface Camera Front (045e:0c85)"
    );
  });

  it("falls back to 'Camera' for an empty or missing label", () => {
    expect(formatCameraLabel("")).toBe("Camera");
    expect(formatCameraLabel(null)).toBe("Camera");
    expect(formatCameraLabel(undefined)).toBe("Camera");
  });
});
