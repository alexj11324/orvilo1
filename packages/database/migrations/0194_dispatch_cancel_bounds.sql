ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "cancel_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "last_cancel_error" text;
