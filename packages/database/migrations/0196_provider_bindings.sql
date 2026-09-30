CREATE TABLE IF NOT EXISTS "provider_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_bindings" DROP CONSTRAINT IF EXISTS "provider_bindings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "provider_bindings" ADD CONSTRAINT "provider_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_bindings_user_id_idx" ON "provider_bindings" USING btree ("user_id");
