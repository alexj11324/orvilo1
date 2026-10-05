-- Journal 0198. Generated from the integrated schema after 0196/0197, then hardened for replay.
-- Execution remains disabled; this registers storage only.
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
ALTER TABLE "mcp_event_challenges" DROP CONSTRAINT IF EXISTS "mcp_event_challenges_binding_id_mcp_event_bindings_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_event_challenges" ADD CONSTRAINT "mcp_event_challenges_binding_id_mcp_event_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."mcp_event_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" DROP CONSTRAINT IF EXISTS "mcp_event_trigger_runs_inbox_id_mcp_event_inbox_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" ADD CONSTRAINT "mcp_event_trigger_runs_inbox_id_mcp_event_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."mcp_event_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" DROP CONSTRAINT IF EXISTS "mcp_event_trigger_runs_trigger_id_mcp_event_triggers_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_event_trigger_runs" ADD CONSTRAINT "mcp_event_trigger_runs_trigger_id_mcp_event_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."mcp_event_triggers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_bindings_callback_token_unique" ON "mcp_event_bindings" USING btree ("callback_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_challenges_delivery_unique" ON "mcp_event_challenges" USING btree ("binding_id","webhook_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_challenges_value_unique" ON "mcp_event_challenges" USING btree ("binding_id","challenge_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_inbox_delivery_unique" ON "mcp_event_inbox" USING btree ("tenant_id","subscription_id","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_inbox_ready" ON "mcp_event_inbox" USING btree ("status","available_at","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_trigger_runs_key_unique" ON "mcp_event_trigger_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_trigger_runs_occurrence_unique" ON "mcp_event_trigger_runs" USING btree ("tenant_id","inbox_id","trigger_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_triggers_task_unique" ON "mcp_event_triggers" USING btree ("tenant_id","task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_triggers_subscription" ON "mcp_event_triggers" USING btree ("tenant_id","subscription_id");
