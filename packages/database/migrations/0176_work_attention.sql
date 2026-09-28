CREATE TABLE "event_consumer_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer" text NOT NULL,
	"event_id" text NOT NULL,
	"outbox_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"acked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navigation_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_bulk_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"action" text NOT NULL,
	"query_fingerprint" text NOT NULL,
	"cutoff_revision" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_event_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer" text NOT NULL,
	"event_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"notification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_feed_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"owner_user_id" text NOT NULL,
	"team_id" text,
	"name" varchar(255) NOT NULL,
	"entity_type" text NOT NULL,
	"query_ast" jsonb NOT NULL,
	"layout" text DEFAULT 'list' NOT NULL,
	"display_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"reason" text DEFAULT 'manual' NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resource_type" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "source_event_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "thread_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "episode_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "kind" text DEFAULT 'update' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_kind" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_request_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "activity_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "latest_feed_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "projection_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "triage_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "duplicate_of_task_id" text;--> statement-breakpoint
ALTER TABLE "navigation_favorites" ADD CONSTRAINT "navigation_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_bulk_snapshots" ADD CONSTRAINT "notification_bulk_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event_receipts" ADD CONSTRAINT "notification_event_receipts_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_feed_state" ADD CONSTRAINT "notification_feed_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subscriptions" ADD CONSTRAINT "task_subscriptions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subscriptions" ADD CONSTRAINT "task_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subscriptions" ADD CONSTRAINT "task_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_consumer_receipts_consumer_event_unique" ON "event_consumer_receipts" USING btree ("consumer","event_id");--> statement-breakpoint
CREATE INDEX "event_consumer_receipts_pending_idx" ON "event_consumer_receipts" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_favorites_user_scope_target_unique" ON "navigation_favorites" USING btree ("user_id","scope_key","target_type","target_id");--> statement-breakpoint
CREATE INDEX "navigation_favorites_user_scope_idx" ON "navigation_favorites" USING btree ("user_id","scope_key");--> statement-breakpoint
CREATE INDEX "notification_bulk_snapshots_user_scope_idx" ON "notification_bulk_snapshots" USING btree ("user_id","scope_key","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_receipts_unique" ON "notification_event_receipts" USING btree ("consumer","event_id","recipient_user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_feed_state_user_scope_unique" ON "notification_feed_state" USING btree ("user_id","scope_key");--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("owner_user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "saved_views_workspace_visibility_idx" ON "saved_views" USING btree ("workspace_id","visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "task_subscriptions_task_user_unique" ON "task_subscriptions" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "task_subscriptions_user_id_idx" ON "task_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_task_id_tasks_id_fk" FOREIGN KEY ("duplicate_of_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_grants_initiated_by_idx" ON "execution_grants" USING btree ("initiated_by","status");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_workspace_activity" ON "notifications" USING btree ("user_id","workspace_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_episode" ON "notifications" USING btree ("user_id","episode_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_action_request" ON "notifications" USING btree ("action_request_id");--> statement-breakpoint
CREATE INDEX "tasks_duplicate_of_task_id_idx" ON "tasks" USING btree ("duplicate_of_task_id");--> statement-breakpoint
CREATE INDEX "tasks_team_id_triage_idx" ON "tasks" USING btree ("team_id","triage_status");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_not_self" CHECK ("tasks"."duplicate_of_task_id" IS NULL OR "tasks"."duplicate_of_task_id" <> "tasks"."id");