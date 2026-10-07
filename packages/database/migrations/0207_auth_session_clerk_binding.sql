ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "clerk_session_id" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;