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
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date_precision" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_date_precision" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "projects_priority_idx" ON "projects" USING btree ("priority");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_priority_valid";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_priority_valid" CHECK ("projects"."priority" BETWEEN 0 AND 4);
