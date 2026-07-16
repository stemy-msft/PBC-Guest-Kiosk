from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(Integer, primary_key=True, index=True)

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    visitor_type = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    church = Column(String, nullable=True)

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

    print_jobs = relationship(
        "PrintJob",
        back_populates="visitor",
        cascade="all, delete-orphan"
    )

class PrintJob(Base):
    __tablename__ = "print_jobs"

    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(
        Integer,
        ForeignKey(
            "visitors.id",
            ondelete="CASCADE"
        )
    )
    badge_path = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Pending")
    printer_name = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    created_time = Column(DateTime, nullable=False)
    claimed_time = Column(DateTime, nullable=True)
    completed_time = Column(DateTime, nullable=True)

    visitor = relationship("Visitor", back_populates="print_jobs")