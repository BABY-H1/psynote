CREATE TABLE "ai_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"pipeline" text NOT NULL,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid,
	"client_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text,
	"source" text,
	"notes" text,
	"reminder_sent_24h" boolean DEFAULT false NOT NULL,
	"reminder_sent_1h" boolean DEFAULT false NOT NULL,
	"client_confirmed_at" timestamp with time zone,
	"confirm_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_type" text,
	"target_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"report_type" text NOT NULL,
	"result_ids" jsonb DEFAULT '[]'::jsonb,
	"batch_id" uuid,
	"assessment_id" uuid,
	"scale_id" uuid,
	"content" jsonb NOT NULL,
	"ai_narrative" text,
	"generated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid,
	"care_episode_id" uuid,
	"demographic_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"custom_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"total_score" numeric,
	"risk_level" text,
	"ai_interpretation" text,
	"client_visible" boolean DEFAULT false NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"batch_id" uuid,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_scales" (
	"assessment_id" uuid NOT NULL,
	"scale_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assessment_scales_assessment_id_scale_id_pk" PRIMARY KEY("assessment_id","scale_id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assessment_type" text DEFAULT 'screening' NOT NULL,
	"demographics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"screening_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"collect_mode" text DEFAULT 'anonymous' NOT NULL,
	"result_display" jsonb DEFAULT '{"mode":"custom","show":["totalScore","riskLevel","dimensionScores","interpretation","advice"]}'::jsonb NOT NULL,
	"share_token" text,
	"allow_client_report" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" uuid,
	"changes" jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"suggestion" text NOT NULL,
	"reason" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"source_rule_id" uuid,
	"source_result_id" uuid,
	"source_payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to_user_id" uuid,
	"handled_by_user_id" uuid,
	"handled_at" timestamp with time zone,
	"handled_note" text,
	"resolved_ref_type" text,
	"resolved_ref_id" uuid,
	"target_group_instance_id" uuid,
	"target_course_instance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"counselor_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"chief_complaint" text,
	"current_risk" text DEFAULT 'level_1' NOT NULL,
	"intervention_type" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"ref_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_parent_invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_parent_invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"granted_to_counselor_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"care_episode_id" uuid,
	"template_id" uuid,
	"title" text NOT NULL,
	"content" text,
	"doc_type" text,
	"consent_type" text,
	"recipient_type" text DEFAULT 'client' NOT NULL,
	"recipient_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"signed_at" timestamp with time zone,
	"signature_data" jsonb,
	"file_path" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text,
	"gender" text,
	"date_of_birth" date,
	"address" text,
	"occupation" text,
	"education" text,
	"marital_status" text,
	"emergency_contact" jsonb,
	"medical_history" text,
	"family_background" text,
	"presenting_issues" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"holder_user_id" uuid NOT NULL,
	"related_client_user_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"bound_via_token_id" uuid,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"note_id" uuid,
	"counselor_id" uuid,
	"review_type" text NOT NULL,
	"score" integer,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"golden_thread_score" integer,
	"quality_indicators" jsonb DEFAULT '{}'::jsonb,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text DEFAULT 'ai' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"document_id" uuid,
	"signer_on_behalf_of" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"consent_type" text NOT NULL,
	"content" text NOT NULL,
	"visibility" text DEFAULT 'personal' NOT NULL,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counselor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"session_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"video_url" text,
	"duration" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"related_assessment_id" uuid,
	"session_goal" text,
	"core_concepts" text,
	"interaction_suggestions" text,
	"homework_suggestion" text
);
--> statement-breakpoint
CREATE TABLE "course_content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"visibility" text DEFAULT 'participant' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"instance_id" uuid,
	"user_id" uuid NOT NULL,
	"care_episode_id" uuid,
	"assigned_by" uuid,
	"enrollment_source" text DEFAULT 'self_enroll',
	"approval_status" text DEFAULT 'auto_approved',
	"approved_by" uuid,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_feedback_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"chapter_id" uuid,
	"title" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_homework_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"chapter_id" uuid,
	"title" text,
	"description" text,
	"question_type" text DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_def_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"content" text,
	"selected_options" jsonb,
	"status" text DEFAULT 'submitted' NOT NULL,
	"review_comment" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"publish_mode" text DEFAULT 'assign' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"capacity" integer,
	"target_group_label" text,
	"responsible_id" uuid,
	"assessment_config" jsonb DEFAULT '{}'::jsonb,
	"location" text,
	"start_date" date,
	"schedule" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_interaction_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"instance_id" uuid,
	"enrollment_id" uuid,
	"response_type" text NOT NULL,
	"response_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_lesson_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"content" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"last_ai_instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_template_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"cover_url" text,
	"duration" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"creation_mode" text DEFAULT 'manual' NOT NULL,
	"course_type" text,
	"target_audience" text,
	"scenario" text,
	"responsible_id" uuid,
	"is_template" boolean DEFAULT false NOT NULL,
	"source_template_id" uuid,
	"requirements_config" jsonb DEFAULT '{}'::jsonb,
	"blueprint_data" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crisis_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"candidate_id" uuid,
	"stage" text DEFAULT 'open' NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closure_summary" text,
	"supervisor_note" text,
	"signed_off_by" uuid,
	"signed_off_at" timestamp with time zone,
	"submitted_for_sign_off_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimension_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension_id" uuid NOT NULL,
	"min_score" numeric NOT NULL,
	"max_score" numeric NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"advice" text,
	"risk_level" text
);
--> statement-breakpoint
CREATE TABLE "distributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"mode" text DEFAULT 'public' NOT NULL,
	"batch_label" text,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eap_counselor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"counselor_user_id" uuid NOT NULL,
	"enterprise_org_id" uuid NOT NULL,
	"provider_org_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eap_crisis_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_org_id" uuid NOT NULL,
	"employee_user_id" uuid NOT NULL,
	"counselor_user_id" uuid NOT NULL,
	"crisis_type" text NOT NULL,
	"description" text,
	"notified_contacts" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eap_employee_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_id" text,
	"department" text,
	"entry_method" text DEFAULT 'link',
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eap_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_org_id" uuid NOT NULL,
	"provider_org_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contract_start" timestamp with time zone,
	"contract_end" timestamp with time zone,
	"seat_allocation" integer,
	"service_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eap_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_org_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"user_id" uuid,
	"department" text,
	"risk_level" text,
	"provider_org_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"event_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment_block_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"enrollment_type" text NOT NULL,
	"block_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"response" jsonb,
	"completed_at" timestamp with time zone,
	"safety_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by_counselor" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"plan_type" text,
	"assessment_id" uuid,
	"frequency" text,
	"next_due" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"review_date" timestamp with time zone DEFAULT now() NOT NULL,
	"result_id" uuid,
	"risk_before" text,
	"risk_after" text,
	"clinical_note" text,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"care_episode_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"screening_result_id" uuid,
	"enrolled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scheme_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"leader_id" uuid,
	"schedule" text,
	"duration" text,
	"start_date" date,
	"location" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"capacity" integer,
	"recruitment_assessments" jsonb DEFAULT '[]'::jsonb,
	"overall_assessments" jsonb DEFAULT '[]'::jsonb,
	"screening_notes" text,
	"assessment_config" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_scheme_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"title" text NOT NULL,
	"goal" text,
	"phases" jsonb DEFAULT '[]'::jsonb,
	"materials" text,
	"duration" text,
	"homework" text,
	"assessment_notes" text,
	"related_goals" jsonb DEFAULT '[]'::jsonb,
	"session_theory" text,
	"session_evaluation" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"related_assessments" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "group_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"theory" text,
	"overall_goal" text,
	"specific_goals" jsonb DEFAULT '[]'::jsonb,
	"target_audience" text,
	"age_range" text,
	"selection_criteria" text,
	"recommended_size" text,
	"total_sessions" integer,
	"session_duration" text,
	"frequency" text,
	"facilitator_requirements" text,
	"evaluation_method" text,
	"notes" text,
	"recruitment_assessments" jsonb DEFAULT '[]'::jsonb,
	"overall_assessments" jsonb DEFAULT '[]'::jsonb,
	"screening_notes" text,
	"visibility" text DEFAULT 'personal' NOT NULL,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_record_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_session_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"visibility" text DEFAULT 'both' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_session_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"scheme_session_id" uuid,
	"session_number" integer NOT NULL,
	"title" text NOT NULL,
	"date" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid,
	"org_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"transcription" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"format" text NOT NULL,
	"field_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'personal' NOT NULL,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"ref_type" text,
	"ref_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"role_v2" text,
	"principal_class" text,
	"access_profile" jsonb,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_until" timestamp with time zone,
	"supervisor_id" uuid,
	"full_practice_access" boolean DEFAULT false NOT NULL,
	"source_partnership_id" uuid,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"specialties" text[] DEFAULT '{}',
	"max_caseload" integer,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"license_key" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triage_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_retention_policy" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phi_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"resource_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"data_class" text,
	"actor_role_snapshot" text,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"referred_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"risk_summary" text,
	"target_type" text,
	"target_name" text,
	"target_contact" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"follow_up_plan" text,
	"follow_up_notes" text,
	"mode" text DEFAULT 'external' NOT NULL,
	"to_counselor_id" uuid,
	"to_org_id" uuid,
	"data_package_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consented_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"download_token" text,
	"download_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"channels" jsonb DEFAULT '["email"]'::jsonb NOT NULL,
	"remind_before" jsonb DEFAULT '[1440,60]'::jsonb NOT NULL,
	"email_config" jsonb DEFAULT '{}'::jsonb,
	"sms_config" jsonb DEFAULT '{}'::jsonb,
	"message_template" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_settings_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "scale_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scale_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"calculation_method" text DEFAULT 'sum' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scale_id" uuid NOT NULL,
	"dimension_id" uuid,
	"text" text NOT NULL,
	"is_reverse_scored" boolean DEFAULT false NOT NULL,
	"options" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"instructions" text,
	"scoring_mode" text DEFAULT 'sum' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"class_name" text NOT NULL,
	"homeroom_teacher_id" uuid,
	"student_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"student_id" text,
	"grade" text,
	"class_name" text,
	"parent_name" text,
	"parent_phone" text,
	"parent_email" text,
	"entry_method" text DEFAULT 'import',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"client_user_id" uuid NOT NULL,
	"preferred_counselor_id" uuid,
	"intake_source" text DEFAULT 'org_portal' NOT NULL,
	"intake_data" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_counselor_id" uuid,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid,
	"appointment_id" uuid,
	"client_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"note_format" text DEFAULT 'soap' NOT NULL,
	"template_id" uuid,
	"session_date" date NOT NULL,
	"duration" integer,
	"session_type" text,
	"subjective" text,
	"objective" text,
	"assessment" text,
	"plan" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"supervisor_annotation" text,
	"submitted_for_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"requires_restart" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "treatment_goal_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"problem_area" text NOT NULL,
	"category" text,
	"objectives_template" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intervention_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'personal' NOT NULL,
	"allowed_org_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"care_episode_id" uuid NOT NULL,
	"counselor_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"approach" text,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interventions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_plan" text,
	"progress_notes" text,
	"review_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"role_before" text,
	"role_after" text,
	"access_profile_before" jsonb,
	"access_profile_after" jsonb,
	"actor_id" uuid,
	"actor_role_snapshot" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"is_system_admin" boolean DEFAULT false NOT NULL,
	"is_guardian_account" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_id" uuid,
	"trigger_event" text NOT NULL,
	"event_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions_matched" boolean NOT NULL,
	"actions_result" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope_assessment_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"trigger_event" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_batch_id_assessment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."assessment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_scale_id_scales_id_fk" FOREIGN KEY ("scale_id") REFERENCES "public"."scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_batch_id_assessment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."assessment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scales" ADD CONSTRAINT "assessment_scales_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scales" ADD CONSTRAINT "assessment_scales_scale_id_scales_id_fk" FOREIGN KEY ("scale_id") REFERENCES "public"."scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_source_rule_id_workflow_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_target_group_instance_id_group_instances_id_fk" FOREIGN KEY ("target_group_instance_id") REFERENCES "public"."group_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pool" ADD CONSTRAINT "candidate_pool_target_course_instance_id_course_instances_id_fk" FOREIGN KEY ("target_course_instance_id") REFERENCES "public"."course_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_timeline" ADD CONSTRAINT "care_timeline_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_timeline" ADD CONSTRAINT "care_timeline_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_parent_invite_tokens" ADD CONSTRAINT "class_parent_invite_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_parent_invite_tokens" ADD CONSTRAINT "class_parent_invite_tokens_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_parent_invite_tokens" ADD CONSTRAINT "class_parent_invite_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_grants" ADD CONSTRAINT "client_access_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_grants" ADD CONSTRAINT "client_access_grants_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_grants" ADD CONSTRAINT "client_access_grants_granted_to_counselor_id_users_id_fk" FOREIGN KEY ("granted_to_counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_grants" ADD CONSTRAINT "client_access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_related_client_user_id_users_id_fk" FOREIGN KEY ("related_client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_bound_via_token_id_class_parent_invite_tokens_id_fk" FOREIGN KEY ("bound_via_token_id") REFERENCES "public"."class_parent_invite_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reviews" ADD CONSTRAINT "compliance_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reviews" ADD CONSTRAINT "compliance_reviews_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reviews" ADD CONSTRAINT "compliance_reviews_note_id_session_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."session_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reviews" ADD CONSTRAINT "compliance_reviews_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_document_id_client_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."client_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_signer_on_behalf_of_users_id_fk" FOREIGN KEY ("signer_on_behalf_of") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_templates" ADD CONSTRAINT "consent_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_templates" ADD CONSTRAINT "consent_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_availability" ADD CONSTRAINT "counselor_availability_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_availability" ADD CONSTRAINT "counselor_availability_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_attachments" ADD CONSTRAINT "course_attachments_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_attachments" ADD CONSTRAINT "course_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_chapters" ADD CONSTRAINT "course_chapters_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_chapters" ADD CONSTRAINT "course_chapters_related_assessment_id_assessments_id_fk" FOREIGN KEY ("related_assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_content_blocks" ADD CONSTRAINT "course_content_blocks_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_content_blocks" ADD CONSTRAINT "course_content_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_instance_id_course_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."course_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_feedback_forms" ADD CONSTRAINT "course_feedback_forms_instance_id_course_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."course_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_feedback_forms" ADD CONSTRAINT "course_feedback_forms_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_feedback_responses" ADD CONSTRAINT "course_feedback_responses_form_id_course_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."course_feedback_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_feedback_responses" ADD CONSTRAINT "course_feedback_responses_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_homework_defs" ADD CONSTRAINT "course_homework_defs_instance_id_course_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."course_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_homework_defs" ADD CONSTRAINT "course_homework_defs_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_homework_submissions" ADD CONSTRAINT "course_homework_submissions_homework_def_id_course_homework_defs_id_fk" FOREIGN KEY ("homework_def_id") REFERENCES "public"."course_homework_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_homework_submissions" ADD CONSTRAINT "course_homework_submissions_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_homework_submissions" ADD CONSTRAINT "course_homework_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_instances" ADD CONSTRAINT "course_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_instances" ADD CONSTRAINT "course_instances_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_instances" ADD CONSTRAINT "course_instances_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_instances" ADD CONSTRAINT "course_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_interaction_responses" ADD CONSTRAINT "course_interaction_responses_block_id_course_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."course_lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_interaction_responses" ADD CONSTRAINT "course_interaction_responses_instance_id_course_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."course_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_interaction_responses" ADD CONSTRAINT "course_interaction_responses_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_blocks" ADD CONSTRAINT "course_lesson_blocks_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_template_tags" ADD CONSTRAINT "course_template_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_source_template_id_courses_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_cases" ADD CONSTRAINT "crisis_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_cases" ADD CONSTRAINT "crisis_cases_episode_id_care_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_cases" ADD CONSTRAINT "crisis_cases_candidate_id_candidate_pool_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_pool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_cases" ADD CONSTRAINT "crisis_cases_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_cases" ADD CONSTRAINT "crisis_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_rules" ADD CONSTRAINT "dimension_rules_dimension_id_scale_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."scale_dimensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_counselor_assignments" ADD CONSTRAINT "eap_counselor_assignments_partnership_id_eap_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."eap_partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_counselor_assignments" ADD CONSTRAINT "eap_counselor_assignments_counselor_user_id_users_id_fk" FOREIGN KEY ("counselor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_counselor_assignments" ADD CONSTRAINT "eap_counselor_assignments_enterprise_org_id_organizations_id_fk" FOREIGN KEY ("enterprise_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_counselor_assignments" ADD CONSTRAINT "eap_counselor_assignments_provider_org_id_organizations_id_fk" FOREIGN KEY ("provider_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_counselor_assignments" ADD CONSTRAINT "eap_counselor_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_crisis_alerts" ADD CONSTRAINT "eap_crisis_alerts_enterprise_org_id_organizations_id_fk" FOREIGN KEY ("enterprise_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_crisis_alerts" ADD CONSTRAINT "eap_crisis_alerts_employee_user_id_users_id_fk" FOREIGN KEY ("employee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_crisis_alerts" ADD CONSTRAINT "eap_crisis_alerts_counselor_user_id_users_id_fk" FOREIGN KEY ("counselor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_employee_profiles" ADD CONSTRAINT "eap_employee_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_employee_profiles" ADD CONSTRAINT "eap_employee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_partnerships" ADD CONSTRAINT "eap_partnerships_enterprise_org_id_organizations_id_fk" FOREIGN KEY ("enterprise_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_partnerships" ADD CONSTRAINT "eap_partnerships_provider_org_id_organizations_id_fk" FOREIGN KEY ("provider_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_partnerships" ADD CONSTRAINT "eap_partnerships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_usage_events" ADD CONSTRAINT "eap_usage_events_enterprise_org_id_organizations_id_fk" FOREIGN KEY ("enterprise_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_usage_events" ADD CONSTRAINT "eap_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eap_usage_events" ADD CONSTRAINT "eap_usage_events_provider_org_id_organizations_id_fk" FOREIGN KEY ("provider_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_plans" ADD CONSTRAINT "follow_up_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_plans" ADD CONSTRAINT "follow_up_plans_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_plans" ADD CONSTRAINT "follow_up_plans_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_plans" ADD CONSTRAINT "follow_up_plans_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_plan_id_follow_up_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."follow_up_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_result_id_assessment_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."assessment_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_instance_id_group_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."group_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_screening_result_id_assessment_results_id_fk" FOREIGN KEY ("screening_result_id") REFERENCES "public"."assessment_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_instances" ADD CONSTRAINT "group_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_instances" ADD CONSTRAINT "group_instances_scheme_id_group_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."group_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_instances" ADD CONSTRAINT "group_instances_leader_id_users_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_instances" ADD CONSTRAINT "group_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_scheme_sessions" ADD CONSTRAINT "group_scheme_sessions_scheme_id_group_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."group_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schemes" ADD CONSTRAINT "group_schemes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schemes" ADD CONSTRAINT "group_schemes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_attendance" ADD CONSTRAINT "group_session_attendance_session_record_id_group_session_records_id_fk" FOREIGN KEY ("session_record_id") REFERENCES "public"."group_session_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_attendance" ADD CONSTRAINT "group_session_attendance_enrollment_id_group_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."group_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_blocks" ADD CONSTRAINT "group_session_blocks_scheme_session_id_group_scheme_sessions_id_fk" FOREIGN KEY ("scheme_session_id") REFERENCES "public"."group_scheme_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_blocks" ADD CONSTRAINT "group_session_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_records" ADD CONSTRAINT "group_session_records_instance_id_group_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."group_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session_records" ADD CONSTRAINT "group_session_records_scheme_session_id_group_scheme_sessions_id_fk" FOREIGN KEY ("scheme_session_id") REFERENCES "public"."group_scheme_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_note_id_session_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."session_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phi_access_logs" ADD CONSTRAINT "phi_access_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phi_access_logs" ADD CONSTRAINT "phi_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phi_access_logs" ADD CONSTRAINT "phi_access_logs_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_to_counselor_id_users_id_fk" FOREIGN KEY ("to_counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scale_dimensions" ADD CONSTRAINT "scale_dimensions_scale_id_scales_id_fk" FOREIGN KEY ("scale_id") REFERENCES "public"."scales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scale_items" ADD CONSTRAINT "scale_items_scale_id_scales_id_fk" FOREIGN KEY ("scale_id") REFERENCES "public"."scales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scale_items" ADD CONSTRAINT "scale_items_dimension_id_scale_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."scale_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scales" ADD CONSTRAINT "scales_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scales" ADD CONSTRAINT "scales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_homeroom_teacher_id_users_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_student_profiles" ADD CONSTRAINT "school_student_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_student_profiles" ADD CONSTRAINT "school_student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_intakes" ADD CONSTRAINT "service_intakes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_intakes" ADD CONSTRAINT "service_intakes_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_template_id_note_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."note_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_goal_library" ADD CONSTRAINT "treatment_goal_library_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_goal_library" ADD CONSTRAINT "treatment_goal_library_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_care_episode_id_care_episodes_id_fk" FOREIGN KEY ("care_episode_id") REFERENCES "public"."care_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_counselor_id_users_id_fk" FOREIGN KEY ("counselor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_audit" ADD CONSTRAINT "user_role_audit_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_audit" ADD CONSTRAINT "user_role_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_audit" ADD CONSTRAINT "user_role_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_rule_id_workflow_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_call_logs_org_created" ON "ai_call_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_episode" ON "ai_conversations" USING btree ("care_episode_id","mode");--> statement-breakpoint
CREATE INDEX "idx_appointments_counselor" ON "appointments" USING btree ("counselor_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_appointments_client" ON "appointments" USING btree ("client_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_batches_org" ON "assessment_batches" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_results_episode" ON "assessment_results" USING btree ("care_episode_id");--> statement-breakpoint
CREATE INDEX "idx_results_user" ON "assessment_results" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_pool_org_status_kind" ON "candidate_pool" USING btree ("org_id","status","kind");--> statement-breakpoint
CREATE INDEX "idx_candidate_pool_client" ON "candidate_pool" USING btree ("client_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_candidate_pool_target_group" ON "candidate_pool" USING btree ("target_group_instance_id","status");--> statement-breakpoint
CREATE INDEX "idx_candidate_pool_target_course" ON "candidate_pool" USING btree ("target_course_instance_id","status");--> statement-breakpoint
CREATE INDEX "idx_care_episodes_client" ON "care_episodes" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_care_timeline_episode" ON "care_timeline" USING btree ("care_episode_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_class_parent_tokens_class" ON "class_parent_invite_tokens" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_access_grants_org_client_counselor" ON "client_access_grants" USING btree ("org_id","client_id","granted_to_counselor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_assignments_org_client_counselor" ON "client_assignments" USING btree ("org_id","client_id","counselor_id");--> statement-breakpoint
CREATE INDEX "idx_client_assignments_counselor" ON "client_assignments" USING btree ("org_id","counselor_id");--> statement-breakpoint
CREATE INDEX "idx_client_assignments_client" ON "client_assignments" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_client_documents_client" ON "client_documents" USING btree ("org_id","client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_profile_org_user" ON "client_profiles" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_rel_org_holder_related" ON "client_relationships" USING btree ("org_id","holder_user_id","related_client_user_id");--> statement-breakpoint
CREATE INDEX "idx_client_rel_holder" ON "client_relationships" USING btree ("holder_user_id");--> statement-breakpoint
CREATE INDEX "idx_client_rel_related" ON "client_relationships" USING btree ("related_client_user_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_reviews_episode" ON "compliance_reviews" USING btree ("care_episode_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_reviews_note" ON "compliance_reviews" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_consent_templates_org" ON "consent_templates" USING btree ("org_id","consent_type");--> statement-breakpoint
CREATE INDEX "idx_availability_counselor" ON "counselor_availability" USING btree ("org_id","counselor_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_availability_slot" ON "counselor_availability" USING btree ("org_id","counselor_id","day_of_week","start_time");--> statement-breakpoint
CREATE INDEX "idx_course_attachments_chapter" ON "course_attachments" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "idx_course_content_blocks_chapter" ON "course_content_blocks" USING btree ("chapter_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_course_enrollments_course_user" ON "course_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_course_feedback_forms_instance" ON "course_feedback_forms" USING btree ("instance_id","chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_feedback_response_form_enrollment" ON "course_feedback_responses" USING btree ("form_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_course_homework_defs_instance" ON "course_homework_defs" USING btree ("instance_id","chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_homework_submission_def_enrollment" ON "course_homework_submissions" USING btree ("homework_def_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_course_instances_org" ON "course_instances" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_course_instances_course" ON "course_instances" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_interaction_responses_block" ON "course_interaction_responses" USING btree ("block_id","instance_id");--> statement-breakpoint
CREATE INDEX "idx_lesson_blocks_chapter" ON "course_lesson_blocks" USING btree ("chapter_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_course_template_tags_org_name" ON "course_template_tags" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_crisis_cases_episode" ON "crisis_cases" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_crisis_cases_org_stage" ON "crisis_cases" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "idx_distributions_assessment" ON "distributions" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_eap_assignments_enterprise_counselor" ON "eap_counselor_assignments" USING btree ("enterprise_org_id","counselor_user_id");--> statement-breakpoint
CREATE INDEX "idx_eap_assignments_counselor" ON "eap_counselor_assignments" USING btree ("counselor_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_eap_assignments_enterprise" ON "eap_counselor_assignments" USING btree ("enterprise_org_id","status");--> statement-breakpoint
CREATE INDEX "idx_eap_crisis_org" ON "eap_crisis_alerts" USING btree ("enterprise_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_eap_employees_org_user" ON "eap_employee_profiles" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_eap_employees_org_dept" ON "eap_employee_profiles" USING btree ("org_id","department");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_eap_partnerships_enterprise_provider" ON "eap_partnerships" USING btree ("enterprise_org_id","provider_org_id");--> statement-breakpoint
CREATE INDEX "idx_eap_partnerships_enterprise" ON "eap_partnerships" USING btree ("enterprise_org_id","status");--> statement-breakpoint
CREATE INDEX "idx_eap_partnerships_provider" ON "eap_partnerships" USING btree ("provider_org_id","status");--> statement-breakpoint
CREATE INDEX "idx_eap_events_org_type_date" ON "eap_usage_events" USING btree ("enterprise_org_id","event_type","event_date");--> statement-breakpoint
CREATE INDEX "idx_eap_events_org_dept_date" ON "eap_usage_events" USING btree ("enterprise_org_id","department","event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_enrollment_block_response" ON "enrollment_block_responses" USING btree ("enrollment_id","enrollment_type","block_id");--> statement-breakpoint
CREATE INDEX "idx_enrollment_block_responses_enrollment" ON "enrollment_block_responses" USING btree ("enrollment_id","enrollment_type");--> statement-breakpoint
CREATE INDEX "idx_enrollment_block_responses_safety" ON "enrollment_block_responses" USING btree ("reviewed_by_counselor");--> statement-breakpoint
CREATE INDEX "idx_follow_up_plans_due" ON "follow_up_plans" USING btree ("org_id","next_due");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_enrollments_instance_user" ON "group_enrollments" USING btree ("instance_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_attendance_session_enrollment" ON "group_session_attendance" USING btree ("session_record_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_group_session_blocks_session" ON "group_session_blocks" USING btree ("scheme_session_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_group_session_records_instance" ON "group_session_records" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_note_templates_org" ON "note_templates" USING btree ("org_id","format");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_org_members_org_user" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_org_members_org" ON "org_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_org_members_user" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_password_reset_token_hash" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_password_reset_user_expires" ON "password_reset_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_referrals_episode" ON "referrals" USING btree ("care_episode_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_to_counselor" ON "referrals" USING btree ("to_counselor_id","status");--> statement-breakpoint
CREATE INDEX "idx_referrals_to_org" ON "referrals" USING btree ("to_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_classes_org_grade_class" ON "school_classes" USING btree ("org_id","grade","class_name");--> statement-breakpoint
CREATE INDEX "idx_school_classes_org" ON "school_classes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_students_org_user" ON "school_student_profiles" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_school_students_org_grade" ON "school_student_profiles" USING btree ("org_id","grade");--> statement-breakpoint
CREATE INDEX "idx_service_intakes_org" ON "service_intakes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_service_intakes_status" ON "service_intakes" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_system_config_category_key" ON "system_config" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX "idx_goal_library_org" ON "treatment_goal_library" USING btree ("org_id","problem_area");--> statement-breakpoint
CREATE INDEX "idx_treatment_plans_episode" ON "treatment_plans" USING btree ("care_episode_id","status");--> statement-breakpoint
CREATE INDEX "idx_user_role_audit_org_user" ON "user_role_audit" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_role_audit_actor" ON "user_role_audit" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_org_rule" ON "workflow_executions" USING btree ("org_id","rule_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_rules_org_trigger_active" ON "workflow_rules" USING btree ("org_id","trigger_event","is_active");--> statement-breakpoint
CREATE INDEX "idx_workflow_rules_scope_assessment" ON "workflow_rules" USING btree ("scope_assessment_id");