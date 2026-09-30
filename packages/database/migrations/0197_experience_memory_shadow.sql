CREATE TABLE IF NOT EXISTS "user_experience_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"legacy_id" text,
	"content" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experience_memories_lifecycle" CHECK ("user_experience_memories"."lifecycle" IN ('active','deleted')),
	CONSTRAINT "experience_memories_revision" CHECK ("user_experience_memories"."revision" > 0),
	CONSTRAINT "experience_memories_content_limit" CHECK (octet_length("user_experience_memories"."content") <= 16384)
);
--> statement-breakpoint
ALTER TABLE "user_experience_memories" DROP CONSTRAINT IF EXISTS "user_experience_memories_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_experience_memories" ADD CONSTRAINT "user_experience_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "experience_memories_owner_legacy" ON "user_experience_memories" USING btree ("user_id","legacy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experience_memories_owner" ON "user_experience_memories" USING btree ("user_id");
