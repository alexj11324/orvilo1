ALTER TABLE "linear_installations" DROP CONSTRAINT IF EXISTS "linear_installations_connector_id_user_connectors_id_fk";
--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "oauth_client_id" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "app_actor_id" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "app_actor_name" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "actor" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "scopes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_owner" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "refresh_fence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD COLUMN IF NOT EXISTS "revocation_reason" text;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_connector_id_user_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."user_connectors"("id") ON DELETE set null ON UPDATE no action;
