"""Batch 2 backend regression tests: response-schema field contracts.

These guard the exact snake_case field names the frontend depends on, so a
future rename cannot silently break the Reporting screen (F-006) or the
returning-visitor required-fields setting (F-015).
"""

from app.schemas import ReportingSummaryResponse, SettingsResponse


# 11
def test_reporting_summary_uses_visitor_types_field():
    assert "visitor_types" in ReportingSummaryResponse.model_fields
    # Regression guard: must not drift to a camelCase name.
    assert "visitorTypes" not in ReportingSummaryResponse.model_fields


# 12
def test_settings_response_uses_required_returning_checkin_fields():
    assert "required_returning_checkin_fields" in SettingsResponse.model_fields
    assert "requiredReturningCheckinFields" not in SettingsResponse.model_fields
