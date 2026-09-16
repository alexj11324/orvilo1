CREATE TABLE IF NOT EXISTS "linear_sync_import_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"binding_id" uuid NOT NULL,
	"linear_issue_id" text NOT NULL,
	"phase" text NOT NULL,
	"status" text NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_phase" text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_reconciliation_cursor" text;--> statement-breakpoint
ALTER TABLE "linear_project_bindings" ADD COLUMN IF NOT EXISTS "import_started_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "linear_sync_import_receipts" ADD CONSTRAINT "linear_sync_import_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "linear_sync_import_receipts" ADD CONSTRAINT "linear_sync_import_receipts_binding_id_linear_project_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."linear_project_bindings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_sync_import_receipts_binding_issue_unique" ON "linear_sync_import_receipts" USING btree ("binding_id","linear_issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_sync_import_receipts_workspace_idx" ON "linear_sync_import_receipts" USING btree ("workspace_id","status");
