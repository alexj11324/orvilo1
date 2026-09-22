CREATE TABLE IF NOT EXISTS "project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"added_by_user_id" text,
	"title" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_links" DROP CONSTRAINT IF EXISTS "project_links_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" DROP CONSTRAINT IF EXISTS "project_links_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_links_project_id_idx" ON "project_links" USING btree ("project_id");
