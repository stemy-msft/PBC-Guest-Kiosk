from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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


class VisitorResponse(BaseModel):
    id: int
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
    photo_path: Optional[str] = None
    badge_path: Optional[str] = None
    check_in_time: datetime
    check_out_time: Optional[datetime] = None
    check_out_method: Optional[str] = None
    badge_printed: bool
    badge_printed_time: Optional[datetime] = None

    class Config:
        from_attributes = True