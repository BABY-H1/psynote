"""
``note_attachments`` — 会谈记录附件 (录音 / 图片 / PDF / 转录文本)。

Drizzle 源: ``server/src/db/schema.ts:408-419``

业务语义:
  - 一行 = 一个挂在某 session_note 下的文件
  - ``file_type``: text / audio / image / pdf
  - ``transcription``: 录音 STT 转文字 (audio/video 类型用)
  - ``file_path``: 存储路径 (S3 key / 本地路径)

cascade: note 删除时附件随删 (note 删了附件留着无意义)。
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.base import CreatedAtOnlyMixin


class NoteAttachment(Base, CreatedAtOnlyMixin):
    __tablename__ = "note_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_notes.id", ondelete="CASCADE"),
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
    )
    file_name: Mapped[str] = mapped_column(Text)
    file_type: Mapped[str] = mapped_column(Text)
    file_path: Mapped[str] = mapped_column(Text)
    file_size: Mapped[int | None] = mapped_column(Integer)
    transcription: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
