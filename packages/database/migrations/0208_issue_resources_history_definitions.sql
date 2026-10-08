CREATE TABLE IF NOT EXISTS "task_description_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"author_user_id" text,
	"domain_revision" integer NOT NULL,
	"instruction" text NOT NULL,
	"editor_data" jsonb,
	"capture_source" text NOT NULL,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_issue_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"definition" jsonb NOT NULL,
	"cadence" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"first_due_date" date NOT NULL,
	"next_due_date" date NOT NULL,
	"timezone" text NOT NULL,
	"next_occurrence_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_occurrence_at" timestamp with time zone,
	"last_task_id" text,
	"last_error" text,
	"visibility" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_issue_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_task_id" text,
	"user_id" text,
	"workspace_id" text,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"added_by_user_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_description_histories" DROP CONSTRAINT IF EXISTS "task_description_histories_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_description_histories" ADD CONSTRAINT "task_description_histories_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_description_histories" DROP CONSTRAINT IF EXISTS "task_description_histories_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_description_histories" ADD CONSTRAINT "task_description_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_description_histories" DROP CONSTRAINT IF EXISTS "task_description_histories_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_description_histories" ADD CONSTRAINT "task_description_histories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_description_histories" DROP CONSTRAINT IF EXISTS "task_description_histories_author_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_description_histories" ADD CONSTRAINT "task_description_histories_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" DROP CONSTRAINT IF EXISTS "task_issue_recurrences_source_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" ADD CONSTRAINT "task_issue_recurrences_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" DROP CONSTRAINT IF EXISTS "task_issue_recurrences_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" ADD CONSTRAINT "task_issue_recurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" DROP CONSTRAINT IF EXISTS "task_issue_recurrences_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" ADD CONSTRAINT "task_issue_recurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" DROP CONSTRAINT IF EXISTS "task_issue_recurrences_last_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_recurrences" ADD CONSTRAINT "task_issue_recurrences_last_task_id_tasks_id_fk" FOREIGN KEY ("last_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_templates" DROP CONSTRAINT IF EXISTS "task_issue_templates_source_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_templates" ADD CONSTRAINT "task_issue_templates_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_templates" DROP CONSTRAINT IF EXISTS "task_issue_templates_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_templates" ADD CONSTRAINT "task_issue_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_issue_templates" DROP CONSTRAINT IF EXISTS "task_issue_templates_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_issue_templates" ADD CONSTRAINT "task_issue_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resources" DROP CONSTRAINT IF EXISTS "task_resources_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resources" DROP CONSTRAINT IF EXISTS "task_resources_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_description_histories_task_revision_unique" ON "task_description_histories" USING btree ("task_id","domain_revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_description_histories_user_id_idx" ON "task_description_histories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_description_histories_author_user_id_idx" ON "task_description_histories" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_description_histories_workspace_id_idx" ON "task_description_histories" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_issue_recurrences_source_task_id_unique" ON "task_issue_recurrences" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_recurrences_user_id_idx" ON "task_issue_recurrences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_recurrences_workspace_id_idx" ON "task_issue_recurrences" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_recurrences_last_task_id_idx" ON "task_issue_recurrences" USING btree ("last_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_recurrences_next_occurrence_idx" ON "task_issue_recurrences" USING btree ("next_occurrence_at") WHERE "task_issue_recurrences"."enabled" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_templates_source_task_id_idx" ON "task_issue_templates" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_templates_user_id_idx" ON "task_issue_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_issue_templates_workspace_id_idx" ON "task_issue_templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_resources_task_kind_url_unique" ON "task_resources" USING btree ("task_id","kind","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_resources_added_by_user_id_idx" ON "task_resources" USING btree ("added_by_user_id");
