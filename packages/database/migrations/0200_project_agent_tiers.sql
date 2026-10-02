ALTER TABLE "project_agents" ADD COLUMN IF NOT EXISTS "tier" text;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN IF NOT EXISTS "tier" text;
