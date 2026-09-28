CREATE SEQUENCE "public"."task_domain_event_revision_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "linear_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"connector_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text,
	"webhook_secret_ref" text,
	"installed_by_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_issue_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"binding_id" uuid,
	"organization_id" text NOT NULL,
	"linear_issue_id" text NOT NULL,
	"linear_identifier" text NOT NULL,
	"last_confirmed_snapshot" jsonb NOT NULL,
	"remote_snapshot" jsonb,
	"conflict" jsonb,
	"sync_state" text DEFAULT 'synced' NOT NULL,
	"last_inbound_delivery_id" text,
	"last_outbound_revision" bigint DEFAULT 0 NOT NULL,
	"remote_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_project_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"linear_project_id" text NOT NULL,
	"default_team_id" text,
	"team_ids" text[] DEFAULT '{}' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"auto_execution_enabled" boolean DEFAULT false NOT NULL,
	"replanning_enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_sync_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"delivery_id" text NOT NULL,
	"webhook_id" text,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text NOT NULL,
	"subject_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_sync_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"link_id" uuid,
	"task_id" text,
	"operation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expected_local_revision" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"outcome_unknown_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"task_id" text,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"revision" bigint DEFAULT nextval('task_domain_event_revision_seq') NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_planning_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"dirty_revision" bigint DEFAULT 0 NOT NULL,
	"planned_revision" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_trigger" jsonb,
	"last_error" text,
	"locked_until" timestamp with time zone,
	"last_planned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_connector_id_user_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."user_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD CONSTRAINT "linear_issue_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD CONSTRAINT "linear_issue_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD CONSTRAINT "linear_issue_links_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_issue_links" ADD CONSTRAINT "linear_issue_links_binding_id_linear_project_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."linear_project_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD CONSTRAINT "linear_project_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD CONSTRAINT "linear_project_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD CONSTRAINT "linear_project_bindings_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD CONSTRAINT "linear_sync_inbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD CONSTRAINT "linear_sync_inbox_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD CONSTRAINT "linear_sync_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD CONSTRAINT "linear_sync_outbox_installation_id_linear_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD CONSTRAINT "linear_sync_outbox_link_id_linear_issue_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."linear_issue_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD CONSTRAINT "linear_sync_outbox_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_domain_events" ADD CONSTRAINT "task_domain_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_domain_events" ADD CONSTRAINT "task_domain_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_domain_events" ADD CONSTRAINT "task_domain_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_planning_scopes" ADD CONSTRAINT "task_planning_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linear_installations_workspace_organization_unique" ON "linear_installations" USING btree ("workspace_id","organization_id");--> statement-breakpoint
CREATE INDEX "linear_installations_workspace_id_idx" ON "linear_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "linear_installations_connector_id_idx" ON "linear_installations" USING btree ("connector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_issue_links_workspace_task_unique" ON "linear_issue_links" USING btree ("workspace_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_issue_links_workspace_issue_unique" ON "linear_issue_links" USING btree ("workspace_id","linear_issue_id");--> statement-breakpoint
CREATE INDEX "linear_issue_links_binding_id_idx" ON "linear_issue_links" USING btree ("binding_id");--> statement-breakpoint
CREATE INDEX "linear_issue_links_installation_id_idx" ON "linear_issue_links" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "linear_issue_links_task_id_idx" ON "linear_issue_links" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "linear_issue_links_sync_state_idx" ON "linear_issue_links" USING btree ("workspace_id","sync_state");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_project_bindings_workspace_project_unique" ON "linear_project_bindings" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_project_bindings_workspace_linear_project_unique" ON "linear_project_bindings" USING btree ("workspace_id","linear_project_id");--> statement-breakpoint
CREATE INDEX "linear_project_bindings_installation_id_idx" ON "linear_project_bindings" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "linear_project_bindings_workspace_id_idx" ON "linear_project_bindings" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_sync_inbox_installation_delivery_unique" ON "linear_sync_inbox" USING btree ("installation_id","delivery_id");--> statement-breakpoint
CREATE INDEX "linear_sync_inbox_claim_idx" ON "linear_sync_inbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "linear_sync_inbox_subject_idx" ON "linear_sync_inbox" USING btree ("workspace_id","subject_id");--> statement-breakpoint
CREATE INDEX "linear_sync_outbox_claim_idx" ON "linear_sync_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "linear_sync_outbox_link_id_idx" ON "linear_sync_outbox" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "linear_sync_outbox_task_id_idx" ON "linear_sync_outbox" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "linear_sync_outbox_workspace_id_idx" ON "linear_sync_outbox" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_domain_events_workspace_idempotency_unique" ON "task_domain_events" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "task_domain_events_scope_revision_idx" ON "task_domain_events" USING btree ("workspace_id","project_id","revision");--> statement-breakpoint
CREATE INDEX "task_domain_events_task_id_idx" ON "task_domain_events" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_planning_scopes_workspace_type_id_unique" ON "task_planning_scopes" USING btree ("workspace_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "task_planning_scopes_ready_idx" ON "task_planning_scopes" USING btree ("status","dirty_revision");