-- Forward repair for Core storage skipped by the historical 0199 journal timestamp.
CREATE TABLE IF NOT EXISTS "action_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_key" text NOT NULL,
	"owner_token" text NOT NULL,
	"receipt" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_session_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"captured_at" bigint NOT NULL,
	"digest" text NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "action_receipts_reservation_key_unique" ON "action_receipts" USING btree ("reservation_key");
