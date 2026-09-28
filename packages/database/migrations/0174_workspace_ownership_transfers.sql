CREATE TABLE IF NOT EXISTS "workspace_ownership_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" DROP CONSTRAINT IF EXISTS "workspace_ownership_transfers_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" DROP CONSTRAINT IF EXISTS "workspace_ownership_transfers_from_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" DROP CONSTRAINT IF EXISTS "workspace_ownership_transfers_to_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_ownership_transfers_pending_workspace_idx" ON "workspace_ownership_transfers" USING btree ("workspace_id") WHERE "workspace_ownership_transfers"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_ownership_transfers_to_user_idx" ON "workspace_ownership_transfers" USING btree ("to_user_id","status");
