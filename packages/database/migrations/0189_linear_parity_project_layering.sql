CREATE TABLE IF NOT EXISTS "project_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" text NOT NULL,
	"successor_id" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_dependencies_no_self_reference" CHECK ("project_dependencies"."predecessor_id" <> "project_dependencies"."successor_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_label_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"label_id" uuid NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"added_by_user_id" text,
	"title" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"health" text,
	"body" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "summary" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "lead_user_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date_precision" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_date_precision" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "health" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" varchar(128);--> statement-breakpoint
ALTER TABLE "project_dependencies" DROP CONSTRAINT IF EXISTS "project_dependencies_predecessor_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_predecessor_id_projects_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" DROP CONSTRAINT IF EXISTS "project_dependencies_successor_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_successor_id_projects_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_label_bindings" DROP CONSTRAINT IF EXISTS "project_label_bindings_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_label_bindings" ADD CONSTRAINT "project_label_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_label_bindings" DROP CONSTRAINT IF EXISTS "project_label_bindings_label_id_project_labels_id_fk";--> statement-breakpoint
ALTER TABLE "project_label_bindings" ADD CONSTRAINT "project_label_bindings_label_id_project_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."project_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" DROP CONSTRAINT IF EXISTS "project_labels_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" DROP CONSTRAINT IF EXISTS "project_milestones_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" DROP CONSTRAINT IF EXISTS "project_links_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" DROP CONSTRAINT IF EXISTS "project_links_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" DROP CONSTRAINT IF EXISTS "project_updates_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" DROP CONSTRAINT IF EXISTS "project_updates_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_drafts" DROP CONSTRAINT IF EXISTS "task_comment_drafts_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_comment_drafts" ADD CONSTRAINT "task_comment_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_dependencies_predecessor_successor_unique" ON "project_dependencies" USING btree ("predecessor_id","successor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_predecessor_id_idx" ON "project_dependencies" USING btree ("predecessor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_successor_id_idx" ON "project_dependencies" USING btree ("successor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_label_bindings_project_id_label_id_unique" ON "project_label_bindings" USING btree ("project_id","label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_label_bindings_project_id_idx" ON "project_label_bindings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_label_bindings_label_id_idx" ON "project_label_bindings" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_labels_workspace_id_name_unique" ON "project_labels" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_labels_workspace_id_idx" ON "project_labels" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_project_id_sort_order_idx" ON "project_milestones" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_project_id_date_idx" ON "project_milestones" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_links_project_id_idx" ON "project_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_updates_project_created_idx" ON "project_updates" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_comment_drafts_task_user_unique" ON "task_comment_drafts" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comment_drafts_user_workspace_idx" ON "task_comment_drafts" USING btree ("user_id","workspace_id");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_lead_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_milestone_id_project_milestones_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_milestone_id_project_milestones_id_fk" FOREIGN KEY ("project_milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_duplicate_of_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_task_id_tasks_id_fk" FOREIGN KEY ("duplicate_of_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_priority_idx" ON "projects" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_milestone_id_idx" ON "tasks" USING btree ("project_milestone_id");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_priority_valid";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_priority_valid" CHECK ("projects"."priority" BETWEEN 0 AND 4);
