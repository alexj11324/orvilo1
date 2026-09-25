CREATE TABLE IF NOT EXISTS "linear_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"state_mappings" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cursor" text,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"issues_imported" integer DEFAULT 0 NOT NULL,
	"issues_skipped" integer DEFAULT 0 NOT NULL,
	"issues_failed" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_owner" uuid,
	"locked_until" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_import_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"linear_issue_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"result" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_import_jobs" ADD CONSTRAINT "linear_import_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_jobs" ADD CONSTRAINT "linear_import_jobs_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_jobs" ADD CONSTRAINT "linear_import_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_receipts" ADD CONSTRAINT "linear_import_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_receipts" ADD CONSTRAINT "linear_import_receipts_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_receipts" ADD CONSTRAINT "linear_import_receipts_job_id_linear_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."linear_import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_receipts" ADD CONSTRAINT "linear_import_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_import_receipts" ADD CONSTRAINT "linear_import_receipts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_import_jobs_scope_unique" ON "linear_import_jobs" USING btree ("workspace_id","installation_id","team_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_import_jobs_workspace_status_idx" ON "linear_import_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_import_receipts_source_unique" ON "linear_import_receipts" USING btree ("workspace_id","installation_id","linear_issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_import_receipts_job_idx" ON "linear_import_receipts" USING btree ("job_id");