CREATE TABLE "ai_models" (
	"id" varchar(150) NOT NULL,
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(200),
	"description" text,
	"organization" varchar(100),
	"enabled" boolean,
	"provider_id" varchar(64) NOT NULL,
	"type" varchar(20) DEFAULT 'chat' NOT NULL,
	"sort" integer,
	"user_id" text NOT NULL,
	"pricing" jsonb,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"config" jsonb,
	"abilities" jsonb DEFAULT '{}'::jsonb,
	"context_window_tokens" integer,
	"source" varchar(20),
	"released_at" varchar(10),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"workspace_id" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" varchar(64) NOT NULL,
	"name" text,
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"sort" integer,
	"enabled" boolean,
	"fetch_on_client" boolean,
	"check_model" text,
	"logo" text,
	"description" text,
	"key_vaults" text,
	"source" varchar(20),
	"settings" jsonb,
	"config" jsonb,
	"workspace_id" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_id_provider_id_user_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id") WHERE "ai_models"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_id_provider_id_user_id_workspace_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id","workspace_id") WHERE "ai_models"."workspace_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_models_user_id_idx" ON "ai_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_models_workspace_id_idx" ON "ai_models" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_id_user_id_unique" ON "ai_providers" USING btree ("id","user_id") WHERE "ai_providers"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_id_user_id_workspace_id_unique" ON "ai_providers" USING btree ("id","user_id","workspace_id") WHERE "ai_providers"."workspace_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_providers_user_id_idx" ON "ai_providers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_providers_workspace_id_idx" ON "ai_providers" USING btree ("workspace_id");