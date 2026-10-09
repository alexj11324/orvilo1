CREATE TABLE IF NOT EXISTS "slack_channel_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"slack_channel_id" text NOT NULL,
	"slack_channel_name" text NOT NULL,
	"agent_id" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slack_user_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"display_name" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_slack_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"installed_by_user_id" text,
	"slack_team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_token_ciphertext" text NOT NULL,
	"scopes" text[] NOT NULL,
	"token_revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" DROP CONSTRAINT IF EXISTS "slack_channel_bindings_installation_id_workspace_slack_installations_id_fk";--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" ADD CONSTRAINT "slack_channel_bindings_installation_id_workspace_slack_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."workspace_slack_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" DROP CONSTRAINT IF EXISTS "slack_channel_bindings_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" ADD CONSTRAINT "slack_channel_bindings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_connections" DROP CONSTRAINT IF EXISTS "slack_user_connections_installation_id_workspace_slack_installations_id_fk";--> statement-breakpoint
ALTER TABLE "slack_user_connections" ADD CONSTRAINT "slack_user_connections_installation_id_workspace_slack_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."workspace_slack_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_connections" DROP CONSTRAINT IF EXISTS "slack_user_connections_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "slack_user_connections" ADD CONSTRAINT "slack_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_slack_installations" DROP CONSTRAINT IF EXISTS "workspace_slack_installations_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_slack_installations" ADD CONSTRAINT "workspace_slack_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_slack_installations" DROP CONSTRAINT IF EXISTS "workspace_slack_installations_installed_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_slack_installations" ADD CONSTRAINT "workspace_slack_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slack_channel_bindings_installation_channel_unique" ON "slack_channel_bindings" USING btree ("installation_id","slack_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slack_user_connections_installation_user_unique" ON "slack_user_connections" USING btree ("installation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "slack_user_connections_installation_slack_user_unique" ON "slack_user_connections" USING btree ("installation_id","slack_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_slack_installations_workspace_unique" ON "workspace_slack_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_slack_installations_team_unique" ON "workspace_slack_installations" USING btree ("slack_team_id");