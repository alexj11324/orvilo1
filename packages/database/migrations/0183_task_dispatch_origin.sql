ALTER TABLE "task_dispatches" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN "initiator" text;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN "source_dispatch_id" text;--> statement-breakpoint
ALTER TABLE "task_dispatches" ADD COLUMN "settlement_grant" jsonb;