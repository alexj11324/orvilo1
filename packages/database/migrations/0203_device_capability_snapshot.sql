ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "capability_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "adapter_version" varchar(32);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp with time zone;