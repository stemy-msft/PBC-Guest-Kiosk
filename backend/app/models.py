from datetime import datetime, UTC

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
    print_station_id = Column(Integer, ForeignKey("print_stations.id"), nullable=False)
    error_message = Column(Text, nullable=True)

    created_time = Column(DateTime, nullable=False)
    claimed_time = Column(DateTime, nullable=True)
    completed_time = Column(DateTime, nullable=True)

    # Batch 5D: ownership + lease + recovery bookkeeping.
    #   claimed_by_agent_id  - the print agent that currently owns the lease.
    #   claim_expires_at     - UTC lease expiry; past this the claim is stale.
    #   claim_generation     - bumped on every claim/requeue so a late update
    #                          from a prior lease can be detected and rejected.
    #   attempt_count        - number of claim attempts (bounded retry cap).
    #   last_recovery_reason - human-readable reason of the last auto-recovery.
    claimed_by_agent_id = Column(
        Integer,
        ForeignKey("print_agents.id"),
        nullable=True,
    )
    claim_expires_at = Column(DateTime, nullable=True)
    claim_generation = Column(
        Integer, nullable=False, default=0, server_default="0"
    )
    attempt_count = Column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_recovery_reason = Column(String, nullable=True)

    visitor = relationship("Visitor", back_populates="print_jobs")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)

    display_name = Column(String, nullable=False)
    email = Column(String, nullable=True)

    role = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)

    last_login = Column(DateTime, nullable=True)

    created_date = Column(DateTime, nullable=False, default=datetime.now(UTC))
    created_by = Column(String, nullable=True)

    modified_date = Column(DateTime, nullable=True)
    modified_by = Column(String, nullable=True)

    password_changed_date = Column(DateTime, nullable=True)
    failed_login_count = Column(Integer, nullable=False, default=0)
    must_change_password = Column(Boolean, nullable=False, default=False)

    notes = Column(Text, nullable=True)

class PrintStation(Base):
    __tablename__ = "print_stations"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    print_server_host = Column(String, nullable=True)
    enabled = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    agent_version = Column(String, nullable=True)
    last_ip = Column(String, nullable=True)

class PrintAgent(Base):
    __tablename__ = "print_agents"

    id = Column(Integer, primary_key=True)
    agent_key = Column(String, unique=True, nullable=False)

    hostname = Column(String, nullable=False)
    printer_name = Column(String, nullable=True)
    agent_version = Column(String, nullable=True)

    last_seen = Column(DateTime, nullable=True)
    last_ip = Column(String, nullable=True)

    print_station_id = Column(
        Integer,
        ForeignKey("print_stations.id"),
        nullable=True,
    )

    enabled = Column(Boolean, nullable=False, default=True)


class PrintAgentCredential(Base):
    """Per-agent bearer credential (Batch 5C).

    Schema-additive: this is a NEW table; the existing ``print_agents`` table is
    unchanged. Only a one-way hash of the verifier is stored. The plaintext
    token (``selector.verifier``) is returned to the agent exactly once, at
    issuance, and never persisted or logged. ``token_selector`` is a public
    lookup handle (not a secret) so a token can be resolved without hashing
    every stored row.
    """

    __tablename__ = "print_agent_credentials"

    id = Column(Integer, primary_key=True)
    print_agent_id = Column(
        Integer,
        ForeignKey("print_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    token_selector = Column(String, unique=True, nullable=False, index=True)
    token_hash = Column(String, nullable=False)

    created_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    last_used_at = Column(DateTime, nullable=True)

    revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(DateTime, nullable=True)


