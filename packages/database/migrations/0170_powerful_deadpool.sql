CREATE TABLE "task_dispatches" (
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
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "orchestration_policy" jsonb DEFAULT '{"autoDispatch":false,"requireHumanReview":true,"replanMode":"disabled"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "orchestration_policy_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "run_state" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "dispatch_id" text;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "task_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "requirement_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "policy_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "plan_revision" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "execution_generation" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "dispatch_fence" integer;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "environment_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_subject_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_subject_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_state_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_category" text DEFAULT 'backlog' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "domain_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "requirement_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "policy_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "execution_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignment_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "orchestration_owner" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "requirement_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lock_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "tasks"
SET
	"created_by_subject_id" = "created_by_user_id",
	"created_by_snapshot" = jsonb_build_object('kind', 'user'),
	"workflow_category" = CASE "status"
		WHEN 'scheduled' THEN 'todo'
		WHEN 'running' THEN 'in_progress'
		WHEN 'paused' THEN 'in_review'
		WHEN 'completed' THEN 'done'
		WHEN 'canceled' THEN 'canceled'
		ELSE 'backlog'
	END,
	"workflow_locked" = CASE WHEN "status" = 'paused' THEN true ELSE false END,
	"lock_metadata" = CASE
		WHEN "status" = 'paused' THEN jsonb_build_object(
			'workflow',
			jsonb_build_object(
				'actorKind', 'system',
				'at', now(),
				'reason', 'legacy_paused_requires_confirmation',
				'revision', 1
			)
		)
		ELSE '{}'::jsonb
	END;--> statement-breakpoint
UPDATE "task_topics"
SET "run_state" = CASE "status"
	WHEN 'completed' THEN 'succeeded'
	WHEN 'canceled' THEN 'canceled'
	WHEN 'failed' THEN 'failed'
	WHEN 'timeout' THEN 'failed'
	ELSE 'running'
END;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_id_workspace_id_unique" ON "tasks" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD CONSTRAINT "task_dispatches_task_workspace_fk" FOREIGN KEY ("task_id","workspace_id") REFERENCES "public"."tasks"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_dispatches_workspace_idempotency_unique" ON "task_dispatches" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dispatches_one_active_task_unique" ON "task_dispatches" USING btree ("task_id") WHERE "task_dispatches"."phase" IN ('requested', 'claimed', 'provisioning', 'dispatched', 'running', 'waiting', 'cancel_requested', 'outcome_unknown');--> statement-breakpoint
CREATE INDEX "task_dispatches_task_generation_idx" ON "task_dispatches" USING btree ("task_id","generation");--> statement-breakpoint
CREATE INDEX "task_dispatches_lease_idx" ON "task_dispatches" USING btree ("phase","lease_expires_at");--> statement-breakpoint
CREATE INDEX "task_dispatches_workspace_id_idx" ON "task_dispatches" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "task_topics" ADD CONSTRAINT "task_topics_dispatch_id_task_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."task_dispatches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_topics_dispatch_id_unique" ON "task_topics" USING btree ("dispatch_id") WHERE "task_topics"."dispatch_id" is not null;--> statement-breakpoint
CREATE INDEX "task_topics_generation_idx" ON "task_topics" USING btree ("task_id","execution_generation");--> statement-breakpoint
CREATE INDEX "tasks_workflow_category_idx" ON "tasks" USING btree ("workflow_category");--> statement-breakpoint
CREATE INDEX "tasks_orchestration_owner_idx" ON "tasks" USING btree ("orchestration_owner");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_managed_creator_requires_workspace" CHECK ("tasks"."created_by_subject_kind" NOT IN ('integration', 'system') OR "tasks"."workspace_id" IS NOT NULL);
