-- Journal 0199. Registers Core authority storage after 0196–0198. Execution remains disabled.
CREATE TABLE IF NOT EXISTS "action_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_key" text NOT NULL,
	"owner_token" text NOT NULL,
	"receipt" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_session_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"captured_at" bigint NOT NULL,
	"digest" text NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_execution_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"task_topic_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"phase" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"record" jsonb NOT NULL,
	CONSTRAINT "task_execution_handoffs_phase_check" CHECK ("task_execution_handoffs"."phase" IN ('prepared','quiescing','quiescent','transferred','resumed'))
);
--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_control" jsonb;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_control_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" DROP CONSTRAINT IF EXISTS "task_execution_handoffs_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" ADD CONSTRAINT "task_execution_handoffs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" DROP CONSTRAINT IF EXISTS "task_execution_handoffs_task_topic_id_task_topics_id_fk";--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" ADD CONSTRAINT "task_execution_handoffs_task_topic_id_task_topics_id_fk" FOREIGN KEY ("task_topic_id") REFERENCES "public"."task_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "action_receipts_reservation_key_unique" ON "action_receipts" USING btree ("reservation_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_execution_handoffs_active" ON "task_execution_handoffs" USING btree ("task_id") WHERE "task_execution_handoffs"."phase" <> 'resumed';
