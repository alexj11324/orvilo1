CREATE TABLE "task_workspace_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"key" text NOT NULL,
	"device_id" text NOT NULL,
	"repo_path" text NOT NULL,
	"worktree_path" text NOT NULL,
	"task_id" text NOT NULL,
	"dispatch_id" text NOT NULL,
	"generation" integer NOT NULL,
	"owner_token" text NOT NULL,
	"expected_base_sha" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_workspace_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"device_id" text NOT NULL,
	"repo_path" text,
	"worktree_path" text NOT NULL,
	"task_id" text,
	"detail" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_workspace_claims" ADD CONSTRAINT "task_workspace_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_workspace_recoveries" ADD CONSTRAINT "task_workspace_recoveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_workspace_claims_key_unique" ON "task_workspace_claims" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_workspace_recoveries_key_unique" ON "task_workspace_recoveries" USING btree ("key");