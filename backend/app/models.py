from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from .database import Base


class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(Integer, primary_key=True, index=True)

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    visitor_type = Column(String, nullable=False)
    church = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    purpose = Column(String, nullable=False)
    host_type = Column(String, nullable=False)
    host_name = Column(String, nullable=False)
    vehicle_plate = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    expected_departure_time = Column(DateTime, nullable=True)

    photo_path = Column(String, nullable=True)
    badge_path = Column(String, nullable=True)

    check_in_time = Column(DateTime, nullable=False)
    check_out_time = Column(DateTime, nullable=True)
    check_out_method = Column(String, nullable=True)

    badge_printed = Column(Boolean, nullable=False, default=False)
    badge_printed_time = Column(DateTime, nullable=True)