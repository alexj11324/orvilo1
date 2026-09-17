ALTER TABLE "tasks" ALTER COLUMN "workflow_state_ref_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "cycle_ref_id" SET DATA TYPE uuid;