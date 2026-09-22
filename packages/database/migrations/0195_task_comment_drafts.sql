CREATE TABLE IF NOT EXISTS "task_comment_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"content" text NOT NULL,
	"editor_data" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_comment_drafts_task_user_unique" ON "task_comment_drafts" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comment_drafts_user_workspace_idx" ON "task_comment_drafts" USING btree ("user_id","workspace_id");
