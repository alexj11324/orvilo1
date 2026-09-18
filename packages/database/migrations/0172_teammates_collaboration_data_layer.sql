CREATE TABLE IF NOT EXISTS "action_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"action_type" text NOT NULL,
	"action_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_type" text,
	"target_id" text,
	"params_hash" text,
	"base_version" integer,
	"base_sha" text,
	"requested_by" text,
	"approver_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"workspace_id" text,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"task_id" text,
	"task_topic_id" uuid,
	"agent_id" text NOT NULL,
	"initiated_by" text NOT NULL,
	"delegation_subject_type" text DEFAULT 'user' NOT NULL,
	"delegation_subject_id" text,
	"allowed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credential_binding_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_binding_id" text,
	"budget_reservation" jsonb,
	"authz_versions" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"authz_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"base_task_version" integer,
	"intent_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_inputs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_invitation_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"project_id" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_grant_id" text;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "email_normalized" text;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "token_hash" text;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "accepted_by" text;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "revoked_by" text;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "created_by_policy_version" integer;--> statement-breakpoint
-- Retire legacy plaintext bearer tokens: pending invitations issued before
-- token_hash existed can no longer be consumed and must be re-invited.
-- (pgcrypto digest() is not available on every target, so hashing the legacy
-- values in place is not possible here.)
UPDATE "workspace_invitations" SET "status" = 'expired'
WHERE "status" = 'pending' AND "token" IS NOT NULL AND "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "authz_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "policy_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "action_approvals" DROP CONSTRAINT IF EXISTS "action_approvals_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approvals" DROP CONSTRAINT IF EXISTS "action_approvals_requested_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approvals" DROP CONSTRAINT IF EXISTS "action_approvals_approver_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_outbox" DROP CONSTRAINT IF EXISTS "event_outbox_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_task_topic_id_task_topics_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_task_topic_id_task_topics_id_fk" FOREIGN KEY ("task_topic_id") REFERENCES "public"."task_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_grants" DROP CONSTRAINT IF EXISTS "execution_grants_initiated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "execution_grants" ADD CONSTRAINT "execution_grants_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_workspace_member_fk";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inputs" DROP CONSTRAINT IF EXISTS "task_inputs_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "task_inputs" ADD CONSTRAINT "task_inputs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inputs" DROP CONSTRAINT IF EXISTS "task_inputs_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_inputs" ADD CONSTRAINT "task_inputs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inputs" DROP CONSTRAINT IF EXISTS "task_inputs_author_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_inputs" ADD CONSTRAINT "task_inputs_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inputs" DROP CONSTRAINT IF EXISTS "task_inputs_decided_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_inputs" ADD CONSTRAINT "task_inputs_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_projects" DROP CONSTRAINT IF EXISTS "workspace_invitation_projects_invitation_id_workspace_invitations_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitation_projects" ADD CONSTRAINT "workspace_invitation_projects_invitation_id_workspace_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_projects" DROP CONSTRAINT IF EXISTS "workspace_invitation_projects_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitation_projects" ADD CONSTRAINT "workspace_invitation_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_approvals_workspace_id_idx" ON "action_approvals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_approvals_workspace_status_idx" ON "action_approvals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_approvals_target_idx" ON "action_approvals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_outbox_event_id_unique" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_outbox_status_next_attempt_at_idx" ON "event_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_outbox_workspace_aggregate_idx" ON "event_outbox" USING btree ("workspace_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_grants_workspace_id_idx" ON "execution_grants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_grants_task_id_idx" ON "execution_grants" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_grants_task_topic_id_idx" ON "execution_grants" USING btree ("task_topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_grants_agent_id_idx" ON "execution_grants" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_id_user_id_unique" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_members_workspace_id_user_id_idx" ON "project_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_members_workspace_id_project_id_idx" ON "project_members" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_inputs_task_id_sequence_unique" ON "task_inputs" USING btree ("task_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_inputs_task_id_idx" ON "task_inputs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_inputs_workspace_id_idx" ON "task_inputs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitation_projects_invitation_id_project_id_unique" ON "workspace_invitation_projects" USING btree ("invitation_id","project_id");--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT IF EXISTS "workspace_invitations_accepted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT IF EXISTS "workspace_invitations_revoked_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitations_token_hash_idx" ON "workspace_invitations" USING btree ("token_hash");