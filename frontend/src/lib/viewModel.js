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
