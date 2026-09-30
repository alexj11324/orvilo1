CREATE TABLE IF NOT EXISTS "task_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"remind_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date" date;--> statement-breakpoint
ALTER TABLE "task_reminders" DROP CONSTRAINT IF EXISTS "task_reminders_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminders" DROP CONSTRAINT IF EXISTS "task_reminders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminders" DROP CONSTRAINT IF EXISTS "task_reminders_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_reminders_task_user_unique" ON "task_reminders" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_reminders_user_id_idx" ON "task_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_reminders_pending_idx" ON "task_reminders" USING btree ("remind_at") WHERE "task_reminders"."delivered_at" is null;