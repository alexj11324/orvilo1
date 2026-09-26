CREATE TABLE IF NOT EXISTS "github_user_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"github_user_id" text NOT NULL,
	"grant_revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"token_version" integer DEFAULT 0 NOT NULL,
	"refresh_owner" text,
	"refresh_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_user_connections_user_id_users_id_fk') THEN
    ALTER TABLE "github_user_connections" ADD CONSTRAINT "github_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
