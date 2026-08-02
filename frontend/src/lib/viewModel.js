// Pure view-model helpers extracted from App.jsx so the backend-to-frontend
// field mappings can be unit-tested without mounting the full application.
// These functions must reproduce the exact inline logic they replaced; they
// intentionally do not change any runtime behavior.

/**
 * Map the backend /api/reporting/summary response (snake_case) into the shape
 * the Reporting screen consumes. The one intentional rename is the backend's
 * `visitor_types` -> the view model's `visitorTypes`.
 *
 * @param {object|null|undefined} reportingSummary
 * @returns {{
 *   check_ins_by_location: any[],
 *   recent_arrivals: any[],
 *   visitorTypes: any[],
 *   hourly_activity: any[],
 *   daily_trends: any[],
 *   print_station_usage: any[],
 *   peak_check_in_times: any[],
 * }}
 */
export function mapReportingSummary(reportingSummary) {
  return {
    check_ins_by_location: reportingSummary?.check_ins_by_location ?? [],
    recent_arrivals: reportingSummary?.recent_arrivals ?? [],
    visitorTypes: reportingSummary?.visitor_types ?? [],
    hourly_activity: reportingSummary?.hourly_activity ?? [],
    daily_trends: reportingSummary?.daily_trends ?? [],
    print_station_usage: reportingSummary?.print_station_usage ?? [],
    peak_check_in_times: reportingSummary?.peak_check_in_times ?? [],
  };
}

/**
 * Resolve the "required returning check-in fields" from system settings,
 * honoring the backend's snake_case `required_returning_checkin_fields` and
 * falling back to the provided default when the setting is absent.
 *
 * @param {object|null|undefined} systemSettings
 * @param {any[]} fallback
 * @returns {any[]}
 */
export function resolveRequiredReturningCheckinFields(systemSettings, fallback) {
  return Array.isArray(systemSettings?.required_returning_checkin_fields)
    ? systemSettings.required_returning_checkin_fields
    : fallback;
}

/**
 * Build the payload sent to PUT /api/visitors/{id} from the visitor object the
 * "Update Visitor Details" form actually edits. Previously the handler read a
 * separate `returningVisitor` state that the form never wrote to, so edits
 * (notably Notes) were silently dropped. The payload must be derived from the
 * same object the form binds to so no field is lost.
 *
 * @param {object|null|undefined} visitor
 * @returns {{
 *   first_name: string, last_name: string, visitor_type: string,
 *   purpose: string, host_name: string, vehicle_plate: string,
 *   phone: string, email: string, notes: string,
 *   expected_departure_time: any,
 * }}
 */
export function buildVisitorUpdatePayload(visitor) {
  return {
    first_name: visitor?.first_name ?? "",
    last_name: visitor?.last_name ?? "",
    visitor_type: visitor?.visitor_type ?? "",
    purpose: visitor?.purpose ?? "",
    host_name: visitor?.host_name ?? "",
    vehicle_plate: visitor?.vehicle_plate ?? "",
    phone: visitor?.phone ?? "",
    email: visitor?.email ?? "",
    notes: visitor?.notes ?? "",
    expected_departure_time: visitor?.expected_departure_time ?? null,
  };
}

/**
 * Produce a human-friendly camera name for the photo-capture selector. Android
 * reports raw labels like "camera2 0, facing back" / "camera 1, facing front";
 * normalize those to "Back Camera" / "Front Camera". iPad and desktop already
 * report friendly names (e.g. "Back Camera", "Front Ultra Wide Camera",
 * "Surface Camera Front"), which contain no "facing" hint and pass through
 * unchanged.
 *
 * @param {string|null|undefined} rawLabel
 * @returns {string}
 */
export function formatCameraLabel(rawLabel) {
  const label = (rawLabel ?? "").trim();
  if (!label) {
    return "Camera";
  }
  const lower = label.toLowerCase();
  if (lower.includes("facing back")) {
    return "Back Camera";
  }
  if (lower.includes("facing front")) {
    return "Front Camera";
  }
  return label;
}

