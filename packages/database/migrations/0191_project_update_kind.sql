ALTER TABLE "project_updates" ALTER COLUMN "health" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_updates" ADD COLUMN "kind" text DEFAULT 'update' NOT NULL;