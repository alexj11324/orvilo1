CREATE TABLE "hatchet_workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"owner_token" text NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"result" jsonb,
	"result_is_undefined" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hatchet_workflow_steps" ADD CONSTRAINT "hatchet_workflow_steps_dispatch_id_hatchet_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."hatchet_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hatchet_workflow_steps_dispatch_id_step_name_unique" ON "hatchet_workflow_steps" USING btree ("dispatch_id","step_name");--> statement-breakpoint
CREATE INDEX "hatchet_workflow_steps_lease_idx" ON "hatchet_workflow_steps" USING btree ("status","lease_expires_at");