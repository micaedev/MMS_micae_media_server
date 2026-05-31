from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(512))
    size: Mapped[int] = mapped_column(Integer)
    stream_path: Mapped[str] = mapped_column(String(128))
    storage_id: Mapped[str] = mapped_column(String(32), default="default")
    video_codec: Mapped[str | None] = mapped_column(String(32), nullable=True)
    video_fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    has_audio: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class StorageLocation(Base):
    """Panelden oluşturulan kayıt yolları."""

    __tablename__ = "storage_locations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(256))
    container_path: Mapped[str] = mapped_column(String(1024), unique=True)
    host_path: Mapped[str] = mapped_column(String(1024))
    root_id: Mapped[str] = mapped_column(String(64))
