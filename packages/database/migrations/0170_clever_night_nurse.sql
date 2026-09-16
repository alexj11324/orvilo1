CREATE TABLE "task_planning_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"input_revision" bigint NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" jsonb NOT NULL,
	"event_ids" text[] DEFAULT '{}' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"proposal" jsonb,
	"error" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_planning_revisions" ADD CONSTRAINT "task_planning_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_planning_revisions" ADD CONSTRAINT "task_planning_revisions_scope_id_task_planning_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."task_planning_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_planning_revisions_scope_revision_unique" ON "task_planning_revisions" USING btree ("scope_id","input_revision");--> statement-breakpoint
CREATE INDEX "task_planning_revisions_workspace_status_idx" ON "task_planning_revisions" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "task_planning_revisions_scope_created_at_idx" ON "task_planning_revisions" USING btree ("scope_id","created_at");