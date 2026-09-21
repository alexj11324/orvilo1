CREATE TABLE IF NOT EXISTS "pull_request_review_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"pull_request_id" text NOT NULL,
	"operation" text NOT NULL,
	"operation_id" text NOT NULL,
	"digest" text NOT NULL,
	"status" text NOT NULL,
	"applied_head_sha" text,
	"data" jsonb,
	"reconciled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pull_request_review_receipts" ADD CONSTRAINT "pull_request_review_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_review_receipts" ADD CONSTRAINT "pull_request_review_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pull_request_review_receipts_identity_unique" ON "pull_request_review_receipts" USING btree ("user_id","workspace_id","connection_id","repo_id","pull_request_id","operation","operation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pull_request_review_receipts_scope_idx" ON "pull_request_review_receipts" USING btree ("user_id","workspace_id","repo_id","pull_request_id","operation","operation_id");