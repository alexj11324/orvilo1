CREATE TABLE IF NOT EXISTS "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text,
	"key" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"metadata" jsonb,
	"masked_preview" varchar(255),
	"last_used_at" timestamp with time zone,
	"shared_workspace_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"shared_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT IF EXISTS "credentials_owner_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT IF EXISTS "credentials_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT IF EXISTS "credentials_shared_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_shared_workspace_id_workspaces_id_fk" FOREIGN KEY ("shared_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_owner_user_id_idx" ON "credentials" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_workspace_id_idx" ON "credentials" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_shared_workspace_id_idx" ON "credentials" USING btree ("shared_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credentials_owner_key_unique" ON "credentials" USING btree ("owner_user_id","key") WHERE "credentials"."workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credentials_workspace_key_unique" ON "credentials" USING btree ("workspace_id","key") WHERE "credentials"."workspace_id" IS NOT NULL;
