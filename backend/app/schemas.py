from datetime import datetime
from typing import Optional

from pydantic import BaseModel



class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    new_password: str
    must_change_password: bool = True


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

    class Config:
        from_attributes = True


class PrintJobStatusUpdate(BaseModel):
    status: str
    printer_name: Optional[str] = None
    error_message: Optional[str] = None


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


