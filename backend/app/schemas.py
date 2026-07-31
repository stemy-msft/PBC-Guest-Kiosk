from datetime import datetime
from typing import Optional
from pydantic import BaseModel



class Config:
        from_attributes = True

class DashboardStatsResponse(BaseModel):
    active_visitors: int

    checked_in_today: int

    online_stations: int
    offline_stations: int
    maintenance_stations: int

    pending_jobs: int
    failed_jobs: int

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    new_password: str
    must_change_password: bool = True

class PrintAgentAssign(BaseModel):
    station_id: int | None = None

class ReprintBadgeRequest(BaseModel):
    station_id: int | None = None

class PrintAgentRegister(BaseModel):
    agent_key: str | None = None
    hostname: str
    printer_name: str
    agent_version: str
    station_slug: str | None = None

class PrintAgentResponse(BaseModel):
    id: int
    agent_key: str
    hostname: str
    printer_name: str | None = None
    agent_version: str | None = None
    last_seen: datetime | None = None
    last_ip: str | None = None
    enabled: bool

    station_id: int | None = None
    station_name: str | None = None
    station_slug: str | None = None

class PrintAgentRegisterResponse(PrintAgentResponse):
    # ``agent_token`` carries the freshly issued plaintext credential and is
    # populated ONLY in the registration response, only when a credential was
    # actually issued. It is never stored, logged, or returned by any list
    # endpoint (GET /api/print-agents uses PrintAgentResponse, which omits it).
    agent_token: str | None = None

class PrintAgentEnabledUpdate(BaseModel):
    enabled: bool

class PrintAgentCredentialIssueResponse(BaseModel):
    agent_id: int
    agent_token: str
    message: str

class PrintJobResponse(BaseModel):
    id: int
    visitor_id: int
    badge_path: str
    status: str
    printer_name: Optional[str] = None
    error_message: Optional[str] = None
    created_time: datetime
    claimed_time: Optional[datetime] = None
    completed_time: Optional[datetime] = None
    station_name: Optional[str] = None
    station_slug: Optional[str] = None
    claim_generation: Optional[int] = None

    class Config:
        from_attributes = True


class PrintJobPublicStatusResponse(BaseModel):
    """Batch 5D visitor-facing status projection.

    Deliberately minimal per the ratified visitor-facing identity boundary
    (§21.10): it exposes only the normalized job status and the friendly
    station name. It never leaks printer name, agent identity/IP, lease
    timing, generation, or any internal transition state.
    """

    status: str
    station_name: Optional[str] = None


class PrintJobStatusUpdate(BaseModel):
    status: str
    printer_name: Optional[str] = None
    error_message: Optional[str] = None
    # Optional at the schema level only for typing convenience; the server
    # requires it on every status update (400 if missing, 409 on mismatch).
    claim_generation: Optional[int] = None


class PrintStationCreate(BaseModel):
    name: str
    slug: str
    print_server_host: str | None = None
    enabled: bool = True


class PrintStationHeartbeat(BaseModel):
    station_slug: str
    agent_version: str


class PrintStationResponse(BaseModel):
    id: int
    name: str
    slug: str
    print_server_host: str | None = None
    enabled: bool

    last_seen: datetime | None = None
    agent_version: str | None = None
    last_ip: str | None = None

    class Config:
        from_attributes = True

class PrintStationStatsResponse(BaseModel):
    pending_jobs: int
    printing_jobs: int
    completed_jobs: int
    failed_jobs: int
    
class PrintStationUpdate(BaseModel):
    name: str
    slug: str
    print_server_host: str | None = None
    enabled: bool = True


class ReturningVisitorCheckInRequest(BaseModel):
    first_name: str
    last_name: str
    visitor_type: str
    purpose: str
    host_type: str = ""
    host_name: str
    phone: str | None = None
    email: str | None = None
    vehicle_plate: str | None = None
    notes: str | None = None
    expected_departure_time: datetime | None = None
    reuse_existing_photo: bool = True

class SettingsResponse(BaseModel):
    theme: str
    auto_refresh_seconds: int
    base_checkin_url: str
    visitor_types: list[str]
    visit_purposes: list[str]
    required_checkin_fields: list[str]
    required_returning_checkin_fields: list[str]


class SettingsUpdate(BaseModel):
    theme: str
    auto_refresh_seconds: int
    base_checkin_url: str
    visitor_types: list[str]
    visit_purposes: list[str]
    required_checkin_fields: list[str]
    required_returning_checkin_fields: list[str]


class ThemeCreate(BaseModel):
    id: str
    tokens: dict[str, str]


class ThemeUpdate(BaseModel):
    tokens: dict[str, str]


class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str
    email: str | None = None
    role: str


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None
    role: str
    enabled: bool
    last_login: datetime | None
    created_date: datetime
    password_changed_date: datetime | None


class UserStatusUpdate(BaseModel):
    enabled: bool

    
class UserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    enabled: bool | None = None
    notes: str | None = None


class VisitorCreate(BaseModel):
    first_name: str
    last_name: str
    visitor_type: str
    church: Optional[str] = None
    phone: Optional[str] = None
    purpose: str
    host_type: str
    host_name: str
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None
    expected_departure_time: Optional[datetime] = None
    email: Optional[str] = None
    # Slug of the check-in station from the kiosk/QR URL. Resolved and persisted
    # server-side; printing derives the station from the stored value.
    station: Optional[str] = None


class VisitorResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    visitor_type: str
    church: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    purpose: str
    host_type: str
    host_name: str
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None
    expected_departure_time: Optional[datetime] = None
    photo_path: Optional[str] = None
    badge_path: Optional[str] = None
    check_in_time: datetime
    check_out_time: Optional[datetime] = None
    check_out_method: Optional[str] = None
    badge_printed: bool
    badge_printed_time: Optional[datetime] = None
    print_station_id: Optional[int] = None

    class Config:
        from_attributes = True


class VisitorCheckoutLocatorResponse(BaseModel):
    """Minimized public shape for the anonymous Visitor Check-Out locator
    (``GET /api/visitors/find``). Exposes only the fields the kiosk check-out
    screen reads; no PII or file paths reach anonymous callers."""

    id: int
    first_name: str
    last_name: str
    visitor_type: str

    class Config:
        from_attributes = True


class VisitorUpdateRequest(BaseModel):
    first_name: str
    last_name: str
    phone: str | None = None
    email: str | None = None
    vehicle_plate: str | None = None
    host_name: str | None = None
    purpose: str | None = None
    visitor_type: str | None = None
    notes: str | None = None




class ReportingCountItem(BaseModel):
    label: str
    count: int


class ReportingRecentArrival(BaseModel):
    id: int
    visitor_name: str
    visitor_type: str
    check_in_time: datetime
    station_name: str | None = None


class ReportingHourlyItem(BaseModel):
    hour: int
    label: str
    count: int


class ReportingDailyTrendItem(BaseModel):
    date: str
    count: int


class ReportingPeakTimeItem(BaseModel):
    hour: int
    label: str
    count: int


class ReportingSummaryResponse(BaseModel):
    check_ins_by_location: list[ReportingCountItem]
    recent_arrivals: list[ReportingRecentArrival]
    visitor_types: list[ReportingCountItem]
    hourly_activity: list[ReportingHourlyItem]
    daily_trends: list[ReportingDailyTrendItem]
    print_station_usage: list[ReportingCountItem]
    peak_check_in_times: list[ReportingPeakTimeItem]