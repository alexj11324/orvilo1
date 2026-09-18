CREATE TABLE IF NOT EXISTS "notification_bulk_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"action" text NOT NULL,
	"query_fingerprint" text NOT NULL,
	"cutoff_revision" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "duplicate_of_task_id" text;--> statement-breakpoint
ALTER TABLE "notification_bulk_snapshots" DROP CONSTRAINT IF EXISTS "notification_bulk_snapshots_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "notification_bulk_snapshots" ADD CONSTRAINT "notification_bulk_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_bulk_snapshots_user_scope_idx" ON "notification_bulk_snapshots" USING btree ("user_id","scope_key","expires_at");--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_duplicate_of_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_task_id_tasks_id_fk" FOREIGN KEY ("duplicate_of_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_duplicate_of_task_id_idx" ON "tasks" USING btree ("duplicate_of_task_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_duplicate_of_not_self";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_not_self" CHECK ("tasks"."duplicate_of_task_id" IS NULL OR "tasks"."duplicate_of_task_id" <> "tasks"."id");
