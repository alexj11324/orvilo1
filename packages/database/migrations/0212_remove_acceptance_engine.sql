ALTER TABLE "expertise_hits" DROP CONSTRAINT IF EXISTS "expertise_hits_evidence_id_verify_evidence_id_fk";
--> statement-breakpoint
ALTER TABLE "expertise_lessons" DROP CONSTRAINT IF EXISTS "expertise_lessons_compiled_criterion_id_verify_criteria_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "acceptance_comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "acceptance_flow_edges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "acceptance_flow_nodes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "acceptance_flows" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "acceptances" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_check_results" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_criteria" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_evidence" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_reports" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_review_predictions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_rubric_criteria" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_rubrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "verify_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "acceptance_comments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "acceptance_flow_edges" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "acceptance_flow_nodes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "acceptance_flows" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "acceptances" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_check_results" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_criteria" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_evidence" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_reports" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_review_predictions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_rubric_criteria" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_rubrics" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verify_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_reviewer_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "expertise_lessons_compiled_criterion_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "topics_model_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "topics_provider_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reviewer_agent_id" text;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_reviewer_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operations" DROP COLUMN IF EXISTS "verify_status";--> statement-breakpoint
ALTER TABLE "agent_operations" DROP COLUMN IF EXISTS "verify_plan";--> statement-breakpoint
ALTER TABLE "agent_operations" DROP COLUMN IF EXISTS "verify_plan_confirmed_at";--> statement-breakpoint
ALTER TABLE "expertise_domain_snapshots" DROP COLUMN IF EXISTS "compiled_count";--> statement-breakpoint
ALTER TABLE "expertise_hits" DROP COLUMN IF EXISTS "evidence_id";--> statement-breakpoint
ALTER TABLE "expertise_lessons" DROP COLUMN IF EXISTS "compiled_criterion_id";--> statement-breakpoint
ALTER TABLE "task_topics" DROP COLUMN IF EXISTS "review_passed";--> statement-breakpoint
ALTER TABLE "task_topics" DROP COLUMN IF EXISTS "review_score";--> statement-breakpoint
ALTER TABLE "task_topics" DROP COLUMN IF EXISTS "review_scores";--> statement-breakpoint
ALTER TABLE "task_topics" DROP COLUMN IF EXISTS "review_iteration";--> statement-breakpoint
ALTER TABLE "task_topics" DROP COLUMN IF EXISTS "reviewed_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "reviewer_user_id";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "model";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "provider";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_in_review_reviewer_required";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_in_review_reviewer_required" CHECK ("tasks"."workflow_category" <> 'in_review' OR "tasks"."reviewer_agent_id" IS NOT NULL);