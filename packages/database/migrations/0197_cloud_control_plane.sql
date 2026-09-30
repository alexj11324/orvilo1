CREATE TABLE IF NOT EXISTS "user_experience_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"legacy_id" text,
	"content" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experience_memories_lifecycle" CHECK ("user_experience_memories"."lifecycle" IN ('active','deleted')),
	CONSTRAINT "experience_memories_revision" CHECK ("user_experience_memories"."revision" > 0),
	CONSTRAINT "experience_memories_content_limit" CHECK (octet_length("user_experience_memories"."content") <= 16384)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"callback_token" text NOT NULL,
	"state" text NOT NULL,
	"remote_subscription_id" text,
	"binding" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"binding_id" text NOT NULL,
	"webhook_id" text NOT NULL,
	"challenge_hash" text NOT NULL,
	"received_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"event_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"schema_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"delivery" jsonb NOT NULL,
	"received_at" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" bigint NOT NULL,
	"lease_token" text,
	"lease_until" bigint,
	"last_error" text,
	CONSTRAINT "mcp_event_inbox_status_check" CHECK ("mcp_event_inbox"."status" IN ('pending','processing','completed','dead'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_trigger_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"inbox_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"trigger_revision" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dispatch_id" text,
	"reason" text,
	CONSTRAINT "mcp_event_trigger_runs_status_check" CHECK ("mcp_event_trigger_runs"."status" IN ('pending','accepted','filtered','denied'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"filters" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_execution_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"task_topic_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"phase" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"record" jsonb NOT NULL,
	CONSTRAINT "task_execution_handoffs_phase_check" CHECK ("task_execution_handoffs"."phase" IN ('prepared','quiescing','quiescent','transferred','resumed'))
);
--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_control" jsonb;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN IF NOT EXISTS "execution_control_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_experience_memories" DROP CONSTRAINT IF EXISTS "user_experience_memories_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_experience_memories" ADD CONSTRAINT "user_experience_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_event_challenges" DROP CONSTRAINT IF EXISTS "mcp_event_challenges_binding_id_mcp_event_bindings_id_fk";--> statement-breakpoint
ALTER TABLE "mcp_event_challenges" ADD CONSTRAINT "mcp_event_challenges_binding_id_mcp_event_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."mcp_event_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" DROP CONSTRAINT IF EXISTS "mcp_event_trigger_runs_inbox_id_mcp_event_inbox_id_fk";--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" ADD CONSTRAINT "mcp_event_trigger_runs_inbox_id_mcp_event_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."mcp_event_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" DROP CONSTRAINT IF EXISTS "mcp_event_trigger_runs_trigger_id_mcp_event_triggers_id_fk";--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" ADD CONSTRAINT "mcp_event_trigger_runs_trigger_id_mcp_event_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."mcp_event_triggers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_bindings" DROP CONSTRAINT IF EXISTS "provider_bindings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "provider_bindings" ADD CONSTRAINT "provider_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" DROP CONSTRAINT IF EXISTS "task_execution_handoffs_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" ADD CONSTRAINT "task_execution_handoffs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" DROP CONSTRAINT IF EXISTS "task_execution_handoffs_task_topic_id_task_topics_id_fk";--> statement-breakpoint
ALTER TABLE "task_execution_handoffs" ADD CONSTRAINT "task_execution_handoffs_task_topic_id_task_topics_id_fk" FOREIGN KEY ("task_topic_id") REFERENCES "public"."task_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "experience_memories_owner_legacy" ON "user_experience_memories" USING btree ("user_id","legacy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experience_memories_owner" ON "user_experience_memories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_bindings_callback_token_unique" ON "mcp_event_bindings" USING btree ("callback_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_challenges_delivery_unique" ON "mcp_event_challenges" USING btree ("binding_id","webhook_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_challenges_value_unique" ON "mcp_event_challenges" USING btree ("binding_id","challenge_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_inbox_delivery_unique" ON "mcp_event_inbox" USING btree ("tenant_id","subscription_id","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_inbox_ready" ON "mcp_event_inbox" USING btree ("status","available_at","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_trigger_runs_key_unique" ON "mcp_event_trigger_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_trigger_runs_occurrence_unique" ON "mcp_event_trigger_runs" USING btree ("tenant_id","inbox_id","trigger_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_triggers_task_unique" ON "mcp_event_triggers" USING btree ("tenant_id","task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_triggers_subscription" ON "mcp_event_triggers" USING btree ("tenant_id","subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_bindings_user_id_idx" ON "provider_bindings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_execution_handoffs_active" ON "task_execution_handoffs" USING btree ("task_id") WHERE "task_execution_handoffs"."phase" <> 'resumed';