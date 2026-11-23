from uuid import uuid4, UUID
from app.database.base import Base
from datetime import datetime
from sqlalchemy import String, DateTime, Text, func, Float, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from pgvector.sqlalchemy import Vector

class Backtest(Base):
    __tablename__ = "backtests"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    draft_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("strategy_drafts.id"),nullable=True)
    strategy: Mapped[str] = mapped_column(String(100), nullable=False)
    pair: Mapped[str] = mapped_column(String(50), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(10), nullable=True)
    timerange: Mapped[str] = mapped_column(String(50), nullable=False)
    balance: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="backtests")
    draft: Mapped["StrategyDraft"] = relationship(back_populates="backtests")


class StrategyRecord(Base):
    __tablename__ = "strategies"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255))
    profile: Mapped[dict] = mapped_column(JSONB)
    code_path: Mapped[str] = mapped_column(String(500))
    code_hash: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, default=1)
    owner_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default="private")
    moderation_status: Mapped[str] = mapped_column(String(20), default="not_requested")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    drafts: Mapped[list["StrategyDraft"]] = relationship(back_populates="owner")
    backtests: Mapped[list["Backtest"]] = relationship(back_populates="owner")

class StrategyDraft(Base):
    __tablename__ = "strategy_drafts"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    draft_path: Mapped[str] = mapped_column(String(500))
    code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending_approval")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="drafts")
    backtests: Mapped[list["Backtest"]] = relationship(back_populates="draft")