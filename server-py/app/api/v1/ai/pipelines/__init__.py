"""AI pipelines — 33 个业务管线, 镜像 ``server/src/modules/ai/pipelines/``.

Phase 3 Tier 4 阶段:
  - **BYOK 调用点接通**: 每个 pipeline 内部调 ``resolve_ai_credential`` →
    ``AIClient(...)`` → ``log_ai_usage``, 真实跑通框架
  - **业务 prompt + JSON 结构** 留 stub (返回 mock dict 或 raise NotImplementedError),
    Phase 5 真接 LLM 时填

  这与计划"33 pipeline 调用点改写 (大批量小改动)"一致:
    > 重写整个 pipeline 的业务逻辑。pipeline 的 prompt template 可以保持 stub,
    > Phase 5 真接 LLM 时填。

调用点接通 = 拿到 ``ResolvedCredential`` + 构造 ``AIClient`` + 调用 ``log_ai_usage``.
真业务 prompt + JSON shape = stub.

Phase 5 接入路径:
  在 _BYOK_STUB_RESULT[pipeline] 处加真 ``await client.generate_json(SYSTEM, USER, opts)``.
"""

from app.api.v1.ai.pipelines.case_progress_report import case_progress_report
from app.api.v1.ai.pipelines.chat_json_helpers import safe_parse_json, strip_markdown_fence
from app.api.v1.ai.pipelines.client_summary import client_summary
from app.api.v1.ai.pipelines.compliance_review import compliance_review
from app.api.v1.ai.pipelines.course_authoring import (
    generate_all_lesson_blocks,
    generate_course_blueprint,
    generate_single_lesson_block,
    refine_course_blueprint,
    refine_lesson_block,
)
from app.api.v1.ai.pipelines.create_agreement_chat import chat_create_agreement
from app.api.v1.ai.pipelines.create_course_chat import chat_create_course
from app.api.v1.ai.pipelines.create_goal_chat import chat_create_goal
from app.api.v1.ai.pipelines.create_note_template_chat import chat_create_note_template
from app.api.v1.ai.pipelines.create_scale_chat import chat_create_scale
from app.api.v1.ai.pipelines.create_scheme_chat import chat_create_scheme
from app.api.v1.ai.pipelines.create_screening_rules import chat_configure_screening_rules
from app.api.v1.ai.pipelines.extract_agreement import extract_agreement
from app.api.v1.ai.pipelines.extract_course import extract_course
from app.api.v1.ai.pipelines.extract_goal import extract_goal
from app.api.v1.ai.pipelines.extract_note_template import extract_note_template
from app.api.v1.ai.pipelines.extract_scale import extract_scale
from app.api.v1.ai.pipelines.extract_scheme import extract_scheme
from app.api.v1.ai.pipelines.generate_scheme import (
    generate_group_scheme,
    generate_group_scheme_overall,
    generate_group_session_detail,
    refine_group_scheme_overall,
    refine_group_session_detail,
)
from app.api.v1.ai.pipelines.interpretation import interpret_result
from app.api.v1.ai.pipelines.note_guidance_chat import note_guidance_chat
from app.api.v1.ai.pipelines.poster_copy import generate_poster_copy
from app.api.v1.ai.pipelines.progress_report import generate_progress_report
from app.api.v1.ai.pipelines.recommendation import generate_recommendations
from app.api.v1.ai.pipelines.referral_summary import generate_referral_summary
from app.api.v1.ai.pipelines.risk_detection import assess_risk
from app.api.v1.ai.pipelines.session_material import (
    analyze_session_material,
    analyze_session_material_for_format,
)
from app.api.v1.ai.pipelines.simulated_client import simulated_client_chat
from app.api.v1.ai.pipelines.soap_analysis import analyze_soap
from app.api.v1.ai.pipelines.supervision import supervision_chat
from app.api.v1.ai.pipelines.treatment_plan import suggest_treatment_plan
from app.api.v1.ai.pipelines.triage import recommend_triage

__all__ = [
    "analyze_session_material",
    "analyze_session_material_for_format",
    "analyze_soap",
    "assess_risk",
    "case_progress_report",
    "chat_configure_screening_rules",
    "chat_create_agreement",
    "chat_create_course",
    "chat_create_goal",
    "chat_create_note_template",
    "chat_create_scale",
    "chat_create_scheme",
    "client_summary",
    "compliance_review",
    "extract_agreement",
    "extract_course",
    "extract_goal",
    "extract_note_template",
    "extract_scale",
    "extract_scheme",
    "generate_all_lesson_blocks",
    "generate_course_blueprint",
    "generate_group_scheme",
    "generate_group_scheme_overall",
    "generate_group_session_detail",
    "generate_poster_copy",
    "generate_progress_report",
    "generate_recommendations",
    "generate_referral_summary",
    "generate_single_lesson_block",
    "interpret_result",
    "note_guidance_chat",
    "recommend_triage",
    "refine_course_blueprint",
    "refine_group_scheme_overall",
    "refine_group_session_detail",
    "refine_lesson_block",
    "safe_parse_json",
    "simulated_client_chat",
    "strip_markdown_fence",
    "suggest_treatment_plan",
    "supervision_chat",
]
