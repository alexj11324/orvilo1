CREATE TABLE IF NOT EXISTS "automation_result_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"topic_id" text,
	"operation_id" text NOT NULL,
	"destination_id" text NOT NULL,
	"endpoint" text,
	"credential_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"http_status" integer,
	"error" text,
	"delivered_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" ADD COLUMN IF NOT EXISTS "automation_occurrence" jsonb;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "automation_occurrence" jsonb;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "event_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "stop_reason" text;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "result_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "result_outcome" text;--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" DROP CONSTRAINT IF EXISTS "automation_result_deliveries_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" ADD CONSTRAINT "automation_result_deliveries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" DROP CONSTRAINT IF EXISTS "automation_result_deliveries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" ADD CONSTRAINT "automation_result_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" DROP CONSTRAINT IF EXISTS "automation_result_deliveries_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" ADD CONSTRAINT "automation_result_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" DROP CONSTRAINT IF EXISTS "automation_result_deliveries_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "automation_result_deliveries" ADD CONSTRAINT "automation_result_deliveries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "automation_result_deliveries_run_destination_unique" ON "automation_result_deliveries" USING btree ("user_id","operation_id","destination_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_result_deliveries_due" ON "automation_result_deliveries" USING btree ("status","next_attempt_at");