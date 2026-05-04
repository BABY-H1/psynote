"""
Phase 2.5a — Batch 4a smoke test (8 张 assessment 域子表)。

覆盖:
  - scale_dimensions / dimension_rules / scale_items   (量表结构子表)
  - assessment_scales                                   (composite PK 关联表)
  - assessment_results                                  (PHI 核心 + AI 水印)
  - assessment_batches / assessment_reports / distributions (聚合/分发)
"""

from __future__ import annotations

# ─── tablenames ──────────────────────────────────────────────


def test_batch4a_tablenames() -> None:
    from app.db.models.assessment_batches import AssessmentBatch
    from app.db.models.assessment_reports import AssessmentReport
    from app.db.models.assessment_results import AssessmentResult
    from app.db.models.assessment_scales import AssessmentScale
    from app.db.models.dimension_rules import DimensionRule
    from app.db.models.distributions import Distribution
    from app.db.models.scale_dimensions import ScaleDimension
    from app.db.models.scale_items import ScaleItem

    assert AssessmentBatch.__tablename__ == "assessment_batches"
    assert AssessmentReport.__tablename__ == "assessment_reports"
    assert AssessmentResult.__tablename__ == "assessment_results"
    assert AssessmentScale.__tablename__ == "assessment_scales"
    assert DimensionRule.__tablename__ == "dimension_rules"
    assert Distribution.__tablename__ == "distributions"
    assert ScaleDimension.__tablename__ == "scale_dimensions"
    assert ScaleItem.__tablename__ == "scale_items"


# ─── scale_dimensions / scale_items / dimension_rules ───────


def test_scale_dimension_cascade_from_scale() -> None:
    from app.db.models.scale_dimensions import ScaleDimension

    fk = next(iter(ScaleDimension.__table__.c.scale_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_scale_dimension_calculation_method_default_sum() -> None:
    from app.db.models.scale_dimensions import ScaleDimension

    cm = ScaleDimension.__table__.c.calculation_method
    assert "sum" in str(cm.server_default.arg)


def test_dimension_rule_min_max_score_numeric() -> None:
    """得分允许小数 (加权题), 用 Numeric"""
    from sqlalchemy import Numeric

    from app.db.models.dimension_rules import DimensionRule

    cols = DimensionRule.__table__.c
    assert isinstance(cols.min_score.type, Numeric)
    assert isinstance(cols.max_score.type, Numeric)


def test_scale_item_dimension_id_optional() -> None:
    """允许"总分模式"量表不分维度, dimension_id 可空"""
    from app.db.models.scale_items import ScaleItem

    assert ScaleItem.__table__.c.dimension_id.nullable is True


def test_scale_item_options_jsonb_required() -> None:
    """options ([{label, value}]) 必填, 没默认 — Drizzle 一致"""
    from app.db.models.scale_items import ScaleItem

    options = ScaleItem.__table__.c.options
    assert options.nullable is False
    assert options.server_default is None


# ─── assessment_scales (composite PK) ───────────────────────


def test_assessment_scale_composite_primary_key() -> None:
    """主键 = (assessment_id, scale_id), 无独立 id"""
    from app.db.models.assessment_scales import AssessmentScale

    pk_cols = [c.name for c in AssessmentScale.__table__.primary_key.columns]
    assert set(pk_cols) == {"assessment_id", "scale_id"}
    assert "id" not in {c.name for c in AssessmentScale.__table__.columns}


def test_assessment_scale_assessment_cascade() -> None:
    from app.db.models.assessment_scales import AssessmentScale

    fk = next(iter(AssessmentScale.__table__.c.assessment_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


# ─── assessment_results (PHI 核心) ──────────────────────────


def test_assessment_result_user_id_nullable_for_anonymous() -> None:
    """匿名公开测评 user_id 可空"""
    from app.db.models.assessment_results import AssessmentResult

    assert AssessmentResult.__table__.c.user_id.nullable is True


def test_assessment_result_answers_required_no_default() -> None:
    """原始作答必填, 没默认 — 无 answers 数据无意义"""
    from app.db.models.assessment_results import AssessmentResult

    answers = AssessmentResult.__table__.c.answers
    assert answers.nullable is False
    assert answers.server_default is None


def test_assessment_result_dimension_scores_required_no_default() -> None:
    """维度计分必填无默认"""
    from app.db.models.assessment_results import AssessmentResult

    ds = AssessmentResult.__table__.c.dimension_scores
    assert ds.nullable is False
    assert ds.server_default is None


def test_assessment_result_client_visible_default_false() -> None:
    """Phase 9β 安全设计: 咨询师必须显式 opt-in 才让客户看自己的结果"""
    from app.db.models.assessment_results import AssessmentResult

    cv = AssessmentResult.__table__.c.client_visible
    assert cv.nullable is False
    assert "false" in str(cv.server_default.arg).lower()


def test_assessment_result_recommendations_default_empty_array() -> None:
    """AI 推荐默认空数组 (TriageRecommendation[])"""
    from app.db.models.assessment_results import AssessmentResult

    rec = AssessmentResult.__table__.c.recommendations
    assert "[]" in str(rec.server_default.arg)


def test_assessment_result_ai_provenance_nullable() -> None:
    """ai_provenance 可空 — 历史行没 backfill, 前端 fallback 渲染 generic 标签"""
    from app.db.models.assessment_results import AssessmentResult

    assert AssessmentResult.__table__.c.ai_provenance.nullable is True


def test_assessment_result_soft_delete_field() -> None:
    from app.db.models.assessment_results import AssessmentResult

    assert "deleted_at" in {c.name for c in AssessmentResult.__table__.columns}


def test_assessment_result_two_indexes() -> None:
    from app.db.models.assessment_results import AssessmentResult

    names = {idx.name for idx in AssessmentResult.__table__.indexes}
    assert "idx_results_episode" in names
    assert "idx_results_user" in names


# ─── assessment_batches / reports / distributions ──────────


def test_assessment_batch_org_status_index() -> None:
    from app.db.models.assessment_batches import AssessmentBatch

    names = {idx.name for idx in AssessmentBatch.__table__.indexes}
    assert "idx_batches_org" in names


def test_assessment_report_content_required_no_default() -> None:
    """报告内容必填无默认"""
    from app.db.models.assessment_reports import AssessmentReport

    content = AssessmentReport.__table__.c.content
    assert content.nullable is False
    assert content.server_default is None


def test_assessment_report_result_ids_nullable() -> None:
    """Drizzle: .default([]) 没 .notNull() → nullable=True"""
    from app.db.models.assessment_reports import AssessmentReport

    assert AssessmentReport.__table__.c.result_ids.nullable is True


def test_distribution_assessment_cascade() -> None:
    """assessment 删除 → 分发任务跟着删"""
    from app.db.models.distributions import Distribution

    fk = next(iter(Distribution.__table__.c.assessment_id.foreign_keys))
    assert fk.ondelete == "CASCADE"


def test_distribution_completed_count_default_zero() -> None:
    from app.db.models.distributions import Distribution

    cnt = Distribution.__table__.c.completed_count
    assert cnt.nullable is False
    assert "0" in str(cnt.server_default.arg)


# ─── re-export ─────────────────────────────────────────────


def test_batch4a_models_re_exported() -> None:
    from app.db.models import (
        AssessmentBatch,
        AssessmentReport,
        AssessmentResult,
        AssessmentScale,
        DimensionRule,
        Distribution,
        ScaleDimension,
        ScaleItem,
    )

    for m in (
        AssessmentBatch,
        AssessmentReport,
        AssessmentResult,
        AssessmentScale,
        DimensionRule,
        Distribution,
        ScaleDimension,
        ScaleItem,
    ):
        assert m is not None
