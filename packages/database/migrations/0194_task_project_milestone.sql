ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_milestone_id_project_milestones_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_milestone_id_project_milestones_id_fk" FOREIGN KEY ("project_milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_milestone_id_idx" ON "tasks" USING btree ("project_milestone_id");
