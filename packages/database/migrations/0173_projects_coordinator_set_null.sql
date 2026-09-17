-- linear-workspace-v3: projects.user_id now survives owner removal (SET NULL),
-- so the coordinator FK can no longer RESTRICT agent deletion — the owner
-- account cascade reaches agents while workspace projects persist. Clearing
-- the coordinator preserves the project instead of failing the delete.
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_coordinator_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "coordinator_agent_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_coordinator_agent_id_agents_id_fk" FOREIGN KEY ("coordinator_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
