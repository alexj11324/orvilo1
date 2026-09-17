CREATE TABLE "hatchet_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deduplication_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lane_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_run_id" text,
	"error" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hatchet_dispatches_status_updated_at_idx" ON "hatchet_dispatches" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hatchet_dispatches_active_deduplication_key_unique" ON "hatchet_dispatches" USING btree ("deduplication_key") WHERE "hatchet_dispatches"."status" IN ('pending', 'queued', 'running');