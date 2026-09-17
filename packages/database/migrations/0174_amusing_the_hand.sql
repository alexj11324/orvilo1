CREATE TABLE "linear_external_comments" (
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
CREATE TABLE "linear_external_relations" (
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
CREATE TABLE "linear_issue_tombstones" (
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
ALTER TABLE "task_comments" DROP CONSTRAINT "task_comments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_dependencies" DROP CONSTRAINT "task_dependencies_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_comments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dependencies" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD COLUMN "tombstone" jsonb;--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_comments" ADD CONSTRAINT "linear_external_comments_local_comment_id_task_comments_id_fk" FOREIGN KEY ("local_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_local_source_task_id_tasks_id_fk" FOREIGN KEY ("local_source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_external_relations" ADD CONSTRAINT "linear_external_relations_local_target_task_id_tasks_id_fk" FOREIGN KEY ("local_target_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" ADD CONSTRAINT "linear_issue_tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_tombstones" ADD CONSTRAINT "linear_issue_tombstones_issue_link_id_linear_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linear_external_comments_workspace_remote_unique" ON "linear_external_comments" USING btree ("workspace_id","linear_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_external_comments_workspace_local_unique" ON "linear_external_comments" USING btree ("workspace_id","local_comment_id");--> statement-breakpoint
CREATE INDEX "linear_external_comments_issue_link_idx" ON "linear_external_comments" USING btree ("issue_link_id");--> statement-breakpoint
CREATE INDEX "linear_external_comments_issue_idx" ON "linear_external_comments" USING btree ("workspace_id","linear_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_external_relations_workspace_local_unique" ON "linear_external_relations" USING btree ("workspace_id","local_relation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_external_relations_workspace_remote_unique" ON "linear_external_relations" USING btree ("workspace_id","linear_relation_id");--> statement-breakpoint
CREATE INDEX "linear_external_relations_source_issue_idx" ON "linear_external_relations" USING btree ("workspace_id","source_issue_id");--> statement-breakpoint
CREATE INDEX "linear_external_relations_target_issue_idx" ON "linear_external_relations" USING btree ("workspace_id","target_issue_id");--> statement-breakpoint
CREATE INDEX "linear_external_relations_target_task_idx" ON "linear_external_relations" USING btree ("workspace_id","local_target_task_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_issue_tombstones_workspace_idempotency_unique" ON "linear_issue_tombstones" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "linear_issue_tombstones_link_idx" ON "linear_issue_tombstones" USING btree ("issue_link_id","observed_at");--> statement-breakpoint
CREATE INDEX "linear_issue_tombstones_issue_idx" ON "linear_issue_tombstones" USING btree ("workspace_id","linear_issue_id");--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linear_sync_outbox_create_operation_unique" ON "linear_sync_outbox" USING btree ("workspace_id","operation") WHERE "linear_sync_outbox"."operation" like 'linear-issue:create:%';