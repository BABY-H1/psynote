"""Compliance API request/response schemas — 镜像 ``server/src/modules/compliance/``.

涵盖:
  - ``compliance-review.routes.ts``: review CRUD outputs
  - ``consent.routes.ts``: template + document inputs/outputs + sign + revoke
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.api.v1._schema_base import CamelModel

# ─── Compliance review (compliance-review.routes.ts) ────────────────


class ComplianceReviewOutput(CamelModel):
    """单个 compliance_reviews 输出."""

    id: str
    org_id: str
    care_episode_id: str
    note_id: str | None = None
    counselor_id: str | None = None
    review_type: str
    score: int | None = None
    findings: list[Any] = Field(default_factory=list)
    golden_thread_score: int | None = None
    quality_indicators: dict[str, Any] | None = None
    reviewed_at: datetime | None = None
    reviewed_by: str = "ai"


# ─── Consent template (consent.routes.ts:19-68) ────────────────────


class ConsentTemplateCreateInput(CamelModel):
    """``POST /consent-templates`` body."""

    title: str = Field(min_length=1)
    consent_type: str = Field(min_length=1)
    content: str = Field(min_length=1)


class ConsentTemplateUpdateInput(CamelModel):
    """``PATCH /consent-templates/{id}`` body."""

    title: str | None = None
    consent_type: str | None = None
    content: str | None = None


class ConsentTemplateOutput(CamelModel):
    """单个 consent_template 输出."""

    id: str
    org_id: str | None = None
    title: str
    consent_type: str
    content: str
    visibility: str = "personal"
    allowed_org_ids: list[Any] = Field(default_factory=list)
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Consent document (consent.routes.ts:72-110) ───────────────────


class ConsentDocumentCreateInput(CamelModel):
    """``POST /consent-documents`` body — 发送同意书给客户."""

    client_id: str = Field(min_length=1)
    care_episode_id: str | None = None
    template_id: str = Field(min_length=1)
    recipient_type: str | None = None  # 'client' | 'guardian'
    recipient_name: str | None = None  # required when recipient_type='guardian'


class ConsentDocumentOutput(CamelModel):
    """单个 client_documents 输出 (consent doc)."""

    id: str
    org_id: str
    client_id: str
    care_episode_id: str | None = None
    template_id: str | None = None
    title: str
    content: str | None = None
    doc_type: str | None = None
    consent_type: str | None = None
    recipient_type: str = "client"
    recipient_name: str | None = None
    status: str = "pending"
    signed_at: datetime | None = None
    signature_data: dict[str, Any] | None = None
    file_path: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None


# ─── Sign / Revoke (client side — for tests / portal) ──────────────


class SignDocumentInput(CamelModel):
    """文书签署 (Phase 14 含家长代签 signer_on_behalf_of)."""

    name: str = Field(min_length=1)
    ip: str | None = None
    user_agent: str | None = None
    signer_on_behalf_of: str | None = None  # 家长 user.id


__all__ = [
    "ComplianceReviewOutput",
    "ConsentDocumentCreateInput",
    "ConsentDocumentOutput",
    "ConsentTemplateCreateInput",
    "ConsentTemplateOutput",
    "ConsentTemplateUpdateInput",
    "SignDocumentInput",
]
