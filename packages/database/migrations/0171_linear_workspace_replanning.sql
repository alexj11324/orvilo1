CREATE TABLE IF NOT EXISTS "linear_external_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_link_id" uuid NOT NULL,
	"local_comment_id" text,
	"linear_issue_id" text NOT NULL,
	"linear_comment_id" text,
	"source" text NOT NULL,
	"origin" text NOT NULL,
	"confirmation_state" text DEFAULT 'unconfirmed' NOT NULL,
	"last_confirmed_snapshot" jsonb,
	"remote_snapshot" jsonb,
	"tombstone" jsonb,
	"last_inbound_delivery_id" text,
	"last_outbound_operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_external_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_link_id" uuid,
	"local_relation_key" text NOT NULL,
	"linear_relation_id" text,
	"source_issue_id" text,
	"target_issue_id" text,
	"local_source_task_id" text,
	"local_target_task_id" text,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"origin" text NOT NULL,
	"confirmation_state" text DEFAULT 'unconfirmed' NOT NULL,
	"resolution_state" text NOT NULL,
	"last_confirmed_snapshot" jsonb,
	"remote_snapshot" jsonb,
	"tombstone" jsonb,
	"last_inbound_delivery_id" text,
	"last_outbound_operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_issue_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_link_id" uuid NOT NULL,
	"linear_issue_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"origin" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"delivery_id" text,
	"reason" text,
	"snapshot" jsonb,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_sync_import_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"binding_id" uuid NOT NULL,
	"linear_issue_id" text NOT NULL,
	"phase" text NOT NULL,
	"status" text NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"workspace_id" text,
	"project_id" text,
	"agent_id" text,
	"phase" text DEFAULT 'requested' NOT NULL,
	"generation" integer NOT NULL,
	"task_revision" integer NOT NULL,
	"requirement_revision" integer NOT NULL,
	"policy_revision" integer NOT NULL,
	"plan_revision" integer,
	"fence" integer DEFAULT 0 NOT NULL,
	"operation_id" text,
	"idempotency_key" text NOT NULL,
	"requested_by" text NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"waiting_reason" text,
	"environment_snapshot" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_installations" DROP CONSTRAINT IF EXISTS "linear_installations_connector_id_user_connectors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_dependencies" DROP CONSTRAINT IF EXISTS "task_dependencies_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_intervention_resolutions" ALTER COLUMN "version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "linear_installations" ALTER COLUMN "connector_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_comments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dependencies" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "oauth_client_id" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "app_actor_id" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "app_actor_name" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "actor" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "scopes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_owner" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_fence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "revocation_reason" text;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD COLUMN IF NOT EXISTS "tombstone" jsonb;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_cursor" text;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_phase" text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_reconciliation_cursor" text;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD COLUMN IF NOT EXISTS "lease_owner" text;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD COLUMN IF NOT EXISTS "lease_fence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD COLUMN IF NOT EXISTS "lease_owner" text;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD COLUMN IF NOT EXISTS "lease_fence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "orchestration_policy" jsonb DEFAULT '{"autoDispatch":false,"requireHumanReview":true,"replanMode":"disabled"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "orchestration_policy_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "run_state" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "dispatch_id" text;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "task_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "requirement_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "policy_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "plan_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_generation" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "dispatch_fence" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "environment_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by_subject_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by_subject_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_state_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_category" text DEFAULT 'backlog' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "domain_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "requirement_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "policy_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "execution_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignment_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "orchestration_owner" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "requirement_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "lock_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_external_comments" DROP CONSTRAINT IF EXISTS "linear_external_comments_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_comments" DROP CONSTRAINT IF EXISTS "linear_external_comments_issue_link_id_linear_issue_links_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_comments" DROP CONSTRAINT IF EXISTS "linear_external_comments_local_comment_id_task_comments_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_local_comment_id_task_comments_id_fk" FOREIGN KEY ("local_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" DROP CONSTRAINT IF EXISTS "linear_external_relations_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" DROP CONSTRAINT IF EXISTS "linear_external_relations_issue_link_id_linear_issue_links_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" DROP CONSTRAINT IF EXISTS "linear_external_relations_local_source_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_local_source_task_id_tasks_id_fk" FOREIGN KEY ("local_source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" DROP CONSTRAINT IF EXISTS "linear_external_relations_local_target_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_local_target_task_id_tasks_id_fk" FOREIGN KEY ("local_target_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" DROP CONSTRAINT IF EXISTS "linear_issue_tombstones_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" ADD CONSTRAINT "linear_issue_tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" DROP CONSTRAINT IF EXISTS "linear_issue_tombstones_issue_link_id_linear_issue_links_id_fk";--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" ADD CONSTRAINT "linear_issue_tombstones_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_import_receipts" DROP CONSTRAINT IF EXISTS "linear_sync_import_receipts_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_sync_import_receipts" ADD CONSTRAINT "linear_sync_import_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_import_receipts" DROP CONSTRAINT IF EXISTS "linear_sync_import_receipts_binding_id_linear_project_bindings_id_fk";--> statement-breakpoint
ALTER TABLE "linear_sync_import_receipts" ADD CONSTRAINT "linear_sync_import_receipts_binding_id_linear_project_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."linear_project_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" DROP CONSTRAINT IF EXISTS "task_dispatches_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" DROP CONSTRAINT IF EXISTS "task_dispatches_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" DROP CONSTRAINT IF EXISTS "task_dispatches_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_id_workspace_id_unique" ON "tasks" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "task_dispatches" DROP CONSTRAINT IF EXISTS "task_dispatches_task_workspace_fk";--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_task_workspace_fk" FOREIGN KEY ("task_id","workspace_id") REFERENCES "public"."tasks"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_external_comments_workspace_remote_unique" ON "linear_external_comments" USING btree ("workspace_id","linear_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_external_comments_workspace_local_unique" ON "linear_external_comments" USING btree ("workspace_id","local_comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_external_comments_issue_link_idx" ON "linear_external_comments" USING btree ("issue_link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_external_comments_issue_idx" ON "linear_external_comments" USING btree ("workspace_id","linear_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_external_relations_workspace_local_unique" ON "linear_external_relations" USING btree ("workspace_id","local_relation_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_external_relations_workspace_remote_unique" ON "linear_external_relations" USING btree ("workspace_id","linear_relation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_external_relations_source_issue_idx" ON "linear_external_relations" USING btree ("workspace_id","source_issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_external_relations_target_issue_idx" ON "linear_external_relations" USING btree ("workspace_id","target_issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_external_relations_target_task_idx" ON "linear_external_relations" USING btree ("workspace_id","local_target_task_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_issue_tombstones_workspace_idempotency_unique" ON "linear_issue_tombstones" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_issue_tombstones_link_idx" ON "linear_issue_tombstones" USING btree ("issue_link_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_issue_tombstones_issue_idx" ON "linear_issue_tombstones" USING btree ("workspace_id","linear_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_sync_import_receipts_binding_issue_unique" ON "linear_sync_import_receipts" USING btree ("binding_id","linear_issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_sync_import_receipts_workspace_idx" ON "linear_sync_import_receipts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_dispatches_workspace_idempotency_unique" ON "task_dispatches" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_dispatches_one_active_task_unique" ON "task_dispatches" USING btree ("task_id") WHERE "task_dispatches"."phase" IN ('requested', 'claimed', 'provisioning', 'dispatched', 'running', 'waiting', 'cancel_requested', 'outcome_unknown');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dispatches_task_generation_idx" ON "task_dispatches" USING btree ("task_id","generation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dispatches_lease_idx" ON "task_dispatches" USING btree ("phase","lease_expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dispatches_workspace_id_idx" ON "task_dispatches" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "linear_installations" DROP CONSTRAINT IF EXISTS "linear_installations_connector_id_user_connectors_id_fk";--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_connector_id_user_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."user_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" DROP CONSTRAINT IF EXISTS "task_dependencies_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_topics" DROP CONSTRAINT IF EXISTS "task_topics_dispatch_id_task_dispatches_id_fk";--> statement-breakpoint
ALTER TABLE "task_topics" ADD CONSTRAINT "task_topics_dispatch_id_task_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."task_dispatches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_sync_outbox_create_operation_unique" ON "linear_sync_outbox" USING btree ("workspace_id","operation") WHERE "linear_sync_outbox"."operation" like 'linear-issue:create:%';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_topics_dispatch_id_unique" ON "task_topics" USING btree ("dispatch_id") WHERE "task_topics"."dispatch_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_topics_generation_idx" ON "task_topics" USING btree ("task_id","execution_generation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workflow_category_idx" ON "tasks" USING btree ("workflow_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_orchestration_owner_idx" ON "tasks" USING btree ("orchestration_owner");--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_managed_creator_requires_workspace";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_managed_creator_requires_workspace" CHECK ("tasks"."created_by_subject_kind" NOT IN ('integration', 'system') OR "tasks"."workspace_id" IS NOT NULL);
