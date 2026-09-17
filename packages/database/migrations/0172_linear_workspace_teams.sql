CREATE TABLE IF NOT EXISTS "linear_sync_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"scope_revision" integer DEFAULT 1 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cursors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"import_run_id" text,
	"import_phase" text,
	"import_started_at" timestamp with time zone,
	"import_completed_at" timestamp with time zone,
	"teams_linked" integer DEFAULT 0 NOT NULL,
	"projects_linked" integer DEFAULT 0 NOT NULL,
	"issues_imported" integer DEFAULT 0 NOT NULL,
	"issues_failed" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_owner" text,
	"locked_until" timestamp with time zone,
	"lease_fence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_team_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"scope_id" uuid,
	"linear_team_id" text NOT NULL,
	"linear_team_key" text,
	"last_confirmed_snapshot" jsonb,
	"remote_snapshot" jsonb,
	"conflict" jsonb,
	"tombstone" jsonb,
	"sync_state" text DEFAULT 'synced' NOT NULL,
	"last_inbound_delivery_id" text,
	"last_outbound_revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "association_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"relation" text NOT NULL,
	"target_repository_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"source" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision,
	"input_revision" bigint DEFAULT 0 NOT NULL,
	"policy_revision" integer DEFAULT 1 NOT NULL,
	"decision_revision" integer DEFAULT 1 NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"resolution_note" text,
	"idempotency_key" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"added_by_user_id" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider_host" text NOT NULL,
	"remote_repository_id" text,
	"local_only_key" text,
	"coordinate" jsonb NOT NULL,
	"parent_coordinate" jsonb,
	"is_fork" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"registered_by_user_id" text,
	"last_verified_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repository_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"device_id" uuid,
	"authorized_by_user_id" text,
	"canonical_path" text NOT NULL,
	"remote_url" text,
	"remote_repository_id" text,
	"remote_role" text DEFAULT 'origin' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_repo_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"added_by_user_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"added_by_user_id" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(255),
	"number" integer,
	"remote_cycle_id" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_by_user_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_workflow_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" text NOT NULL,
	"position" double precision,
	"remote_state_id" text,
	"color" text,
	"description" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"avatar" text,
	"created_by_user_id" text,
	"created_by_subject_kind" text DEFAULT 'user' NOT NULL,
	"created_by_subject_id" text,
	"created_by_snapshot" jsonb,
	"next_issue_seq" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"coordinator_agent_id" text,
	"default_agent_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"orchestration_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_revision" integer DEFAULT 1 NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"archived_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD COLUMN IF NOT EXISTS "linear_team_id" text;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD COLUMN IF NOT EXISTS "alias_identifiers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "scope_id" uuid;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "sync_state" text DEFAULT 'synced' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "last_confirmed_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "remote_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "conflict" jsonb;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "tombstone" jsonb;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "last_inbound_delivery_id" text;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "last_outbound_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_domain_events" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_subject_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_subject_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "migration_class" text DEFAULT 'undetermined' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_state_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "cycle_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "linear_sync_scopes" DROP CONSTRAINT IF EXISTS "linear_sync_scopes_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_sync_scopes" ADD CONSTRAINT "linear_sync_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_scopes" DROP CONSTRAINT IF EXISTS "linear_sync_scopes_installation_id_linear_installations_id_fk";--> statement-breakpoint
ALTER TABLE "linear_sync_scopes" ADD CONSTRAINT "linear_sync_scopes_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_links" DROP CONSTRAINT IF EXISTS "linear_team_links_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "linear_team_links" ADD CONSTRAINT "linear_team_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_links" DROP CONSTRAINT IF EXISTS "linear_team_links_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "linear_team_links" ADD CONSTRAINT "linear_team_links_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_links" DROP CONSTRAINT IF EXISTS "linear_team_links_installation_id_linear_installations_id_fk";--> statement-breakpoint
ALTER TABLE "linear_team_links" ADD CONSTRAINT "linear_team_links_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_links" DROP CONSTRAINT IF EXISTS "linear_team_links_scope_id_linear_sync_scopes_id_fk";--> statement-breakpoint
ALTER TABLE "linear_team_links" ADD CONSTRAINT "linear_team_links_scope_id_linear_sync_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."linear_sync_scopes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_decisions" DROP CONSTRAINT IF EXISTS "association_decisions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "association_decisions" ADD CONSTRAINT "association_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_decisions" DROP CONSTRAINT IF EXISTS "association_decisions_target_repository_id_repositories_id_fk";--> statement-breakpoint
ALTER TABLE "association_decisions" ADD CONSTRAINT "association_decisions_target_repository_id_repositories_id_fk" FOREIGN KEY ("target_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_decisions" DROP CONSTRAINT IF EXISTS "association_decisions_decided_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "association_decisions" ADD CONSTRAINT "association_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" DROP CONSTRAINT IF EXISTS "project_repositories_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" DROP CONSTRAINT IF EXISTS "project_repositories_repository_id_repositories_id_fk";--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" DROP CONSTRAINT IF EXISTS "project_repositories_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" DROP CONSTRAINT IF EXISTS "project_repositories_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "repositories_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "repositories_registered_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_registered_by_user_id_users_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_checkouts" DROP CONSTRAINT IF EXISTS "repository_checkouts_repository_id_repositories_id_fk";--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_checkouts" DROP CONSTRAINT IF EXISTS "repository_checkouts_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_checkouts" DROP CONSTRAINT IF EXISTS "repository_checkouts_device_id_devices_id_fk";--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_checkouts" DROP CONSTRAINT IF EXISTS "repository_checkouts_authorized_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_authorized_by_user_id_users_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repo_defaults" DROP CONSTRAINT IF EXISTS "team_repo_defaults_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_repo_defaults" ADD CONSTRAINT "team_repo_defaults_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repo_defaults" DROP CONSTRAINT IF EXISTS "team_repo_defaults_repository_id_repositories_id_fk";--> statement-breakpoint
ALTER TABLE "team_repo_defaults" ADD CONSTRAINT "team_repo_defaults_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repo_defaults" DROP CONSTRAINT IF EXISTS "team_repo_defaults_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_repo_defaults" ADD CONSTRAINT "team_repo_defaults_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repo_defaults" DROP CONSTRAINT IF EXISTS "team_repo_defaults_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_repo_defaults" ADD CONSTRAINT "team_repo_defaults_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" DROP CONSTRAINT IF EXISTS "project_teams_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" DROP CONSTRAINT IF EXISTS "project_teams_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" DROP CONSTRAINT IF EXISTS "project_teams_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" DROP CONSTRAINT IF EXISTS "project_teams_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_cycles" DROP CONSTRAINT IF EXISTS "team_cycles_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_cycles" ADD CONSTRAINT "team_cycles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_cycles" DROP CONSTRAINT IF EXISTS "team_cycles_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_cycles" ADD CONSTRAINT "team_cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_workflow_states" DROP CONSTRAINT IF EXISTS "team_workflow_states_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_workflow_states" ADD CONSTRAINT "team_workflow_states_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_workflow_states" DROP CONSTRAINT IF EXISTS "team_workflow_states_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_workflow_states" ADD CONSTRAINT "team_workflow_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_created_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_coordinator_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_coordinator_agent_id_agents_id_fk" FOREIGN KEY ("coordinator_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_default_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_default_agent_id_agents_id_fk" FOREIGN KEY ("default_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_sync_scopes_installation_unique" ON "linear_sync_scopes" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_sync_scopes_workspace_id_idx" ON "linear_sync_scopes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_sync_scopes_status_idx" ON "linear_sync_scopes" USING btree ("status","locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_team_links_workspace_team_unique" ON "linear_team_links" USING btree ("workspace_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_team_links_workspace_linear_team_unique" ON "linear_team_links" USING btree ("workspace_id","linear_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_team_links_installation_id_idx" ON "linear_team_links" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_team_links_sync_state_idx" ON "linear_team_links" USING btree ("workspace_id","sync_state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "association_decisions_workspace_idempotency_unique" ON "association_decisions" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "association_decisions_source_idx" ON "association_decisions" USING btree ("workspace_id","source_kind","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "association_decisions_target_idx" ON "association_decisions" USING btree ("target_repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "association_decisions_status_idx" ON "association_decisions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_repositories_project_repository_unique" ON "project_repositories" USING btree ("project_id","repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_repositories_repository_idx" ON "project_repositories" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_repositories_workspace_id_idx" ON "project_repositories" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repositories_remote_identity_unique" ON "repositories" USING btree ("workspace_id","provider_host","remote_repository_id") WHERE "repositories"."remote_repository_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repositories_local_only_unique" ON "repositories" USING btree ("workspace_id","local_only_key") WHERE "repositories"."local_only_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_workspace_id_idx" ON "repositories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_status_idx" ON "repositories" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repository_checkouts_device_path_unique" ON "repository_checkouts" USING btree ("device_id","canonical_path") WHERE "repository_checkouts"."device_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repository_checkouts_repository_idx" ON "repository_checkouts" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repository_checkouts_workspace_id_idx" ON "repository_checkouts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_repo_defaults_team_repository_unique" ON "team_repo_defaults" USING btree ("team_id","repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_repo_defaults_team_primary_unique" ON "team_repo_defaults" USING btree ("team_id") WHERE "team_repo_defaults"."is_primary" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_repo_defaults_repository_idx" ON "team_repo_defaults" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_repo_defaults_workspace_id_idx" ON "team_repo_defaults" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_teams_project_team_unique" ON "project_teams" USING btree ("project_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_teams_team_id_idx" ON "project_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_teams_workspace_id_idx" ON "project_teams" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_cycles_remote_unique" ON "team_cycles" USING btree ("team_id","remote_cycle_id") WHERE "team_cycles"."remote_cycle_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_cycles_team_id_idx" ON "team_cycles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_cycles_workspace_id_idx" ON "team_cycles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_unique" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_workspace_id_idx" ON "team_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_workflow_states_remote_unique" ON "team_workflow_states" USING btree ("team_id","remote_state_id") WHERE "team_workflow_states"."remote_state_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_workflow_states_team_category_idx" ON "team_workflow_states" USING btree ("team_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_workflow_states_workspace_id_idx" ON "team_workflow_states" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_workspace_key_unique" ON "teams" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_workspace_default_unique" ON "teams" USING btree ("workspace_id") WHERE "teams"."is_default" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_workspace_id_idx" ON "teams" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_workspace_visibility_idx" ON "teams" USING btree ("workspace_id","visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_status_idx" ON "teams" USING btree ("status");--> statement-breakpoint
ALTER TABLE "linear_project_bindings" DROP CONSTRAINT IF EXISTS "linear_project_bindings_scope_id_linear_sync_scopes_id_fk";--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD CONSTRAINT "linear_project_bindings_scope_id_linear_sync_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."linear_sync_scopes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_domain_events" DROP CONSTRAINT IF EXISTS "task_domain_events_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "task_domain_events" ADD CONSTRAINT "task_domain_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_workflow_state_ref_id_team_workflow_states_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_state_ref_id_team_workflow_states_id_fk" FOREIGN KEY ("workflow_state_ref_id") REFERENCES "public"."team_workflow_states"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_cycle_ref_id_team_cycles_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cycle_ref_id_team_cycles_id_fk" FOREIGN KEY ("cycle_ref_id") REFERENCES "public"."team_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_issue_links_linear_team_idx" ON "linear_issue_links" USING btree ("workspace_id","linear_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_domain_events_team_revision_idx" ON "task_domain_events" USING btree ("workspace_id","team_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_team_id_status_idx" ON "tasks" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workflow_state_ref_idx" ON "tasks" USING btree ("workflow_state_ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_cycle_ref_idx" ON "tasks" USING btree ("cycle_ref_id");