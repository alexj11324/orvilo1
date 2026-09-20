CREATE TABLE "agent_operation_launches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"purpose" text NOT NULL,
	"intent_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"operation_id" text,
	"status" text DEFAULT 'claimed' NOT NULL,
	"cancel_reason" text,
	"deadline_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_operation_launches" ADD CONSTRAINT "agent_operation_launches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_operation_launches_intent_workspace_unique" ON "agent_operation_launches" USING btree ("user_id","workspace_id","purpose","intent_key","attempt") WHERE "agent_operation_launches"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_operation_launches_intent_personal_unique" ON "agent_operation_launches" USING btree ("user_id","purpose","intent_key","attempt") WHERE "agent_operation_launches"."workspace_id" is null;--> statement-breakpoint
CREATE INDEX "agent_operation_launches_status_deadline_idx" ON "agent_operation_launches" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "agent_operation_launches_operation_id_idx" ON "agent_operation_launches" USING btree ("operation_id");