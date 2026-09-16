ALTER TABLE "agent_intervention_resolutions" ALTER COLUMN "version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "task_dispatches" ALTER COLUMN "fence" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "linear_sync_inbox" ADD COLUMN "lease_fence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "linear_sync_outbox" ADD COLUMN "lease_fence" integer DEFAULT 0 NOT NULL;
