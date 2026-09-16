ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "run_reservation_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "run_reservation_expires_at" timestamp with time zone;
