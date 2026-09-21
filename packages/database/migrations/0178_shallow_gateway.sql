CREATE TABLE "integration_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"key" text NOT NULL,
	"target" text NOT NULL,
	"ref" text NOT NULL,
	"owner_token" text NOT NULL,
	"owner_task_id" text,
	"owner_topic_id" text,
	"phase" text DEFAULT 'claimed' NOT NULL,
	"expected_base_sha" text,
	"expected_head_sha" text,
	"outcome_unknown" boolean DEFAULT false NOT NULL,
	"context" jsonb,
	"deadline" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_leases" ADD CONSTRAINT "integration_leases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_leases_key_unique" ON "integration_leases" USING btree ("key");