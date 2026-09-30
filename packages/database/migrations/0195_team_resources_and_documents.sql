CREATE TABLE IF NOT EXISTS "team_resource_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"section_id" uuid,
	"added_by_user_id" text,
	"document_id" text,
	"title" varchar(255),
	"url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_resource_placements_kind_check" CHECK ((
        ("team_resource_placements"."document_id" IS NOT NULL AND "team_resource_placements"."title" IS NULL AND "team_resource_placements"."url" IS NULL)
        OR
        ("team_resource_placements"."document_id" IS NULL AND "team_resource_placements"."title" IS NOT NULL AND "team_resource_placements"."url" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_resource_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text,
	"name" varchar(255) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_resource_sections_name_not_empty" CHECK (length(btrim("team_resource_sections"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "team_resource_placements" DROP CONSTRAINT IF EXISTS "team_resource_placements_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_placements" ADD CONSTRAINT "team_resource_placements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_placements" DROP CONSTRAINT IF EXISTS "team_resource_placements_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_placements" ADD CONSTRAINT "team_resource_placements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_placements" DROP CONSTRAINT IF EXISTS "team_resource_placements_section_id_team_resource_sections_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_placements" ADD CONSTRAINT "team_resource_placements_section_id_team_resource_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."team_resource_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_placements" DROP CONSTRAINT IF EXISTS "team_resource_placements_added_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_placements" ADD CONSTRAINT "team_resource_placements_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_placements" DROP CONSTRAINT IF EXISTS "team_resource_placements_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_placements" ADD CONSTRAINT "team_resource_placements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_sections" DROP CONSTRAINT IF EXISTS "team_resource_sections_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_sections" ADD CONSTRAINT "team_resource_sections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_sections" DROP CONSTRAINT IF EXISTS "team_resource_sections_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_sections" ADD CONSTRAINT "team_resource_sections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_resource_sections" DROP CONSTRAINT IF EXISTS "team_resource_sections_created_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_resource_sections" ADD CONSTRAINT "team_resource_sections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_resource_placements_team_section_order_idx" ON "team_resource_placements" USING btree ("team_id","section_id","position","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_resource_placements_workspace_id_idx" ON "team_resource_placements" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_resource_placements_team_document_unique" ON "team_resource_placements" USING btree ("team_id","document_id") WHERE "team_resource_placements"."document_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_resource_sections_team_order_idx" ON "team_resource_sections" USING btree ("team_id","position","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_resource_sections_workspace_id_idx" ON "team_resource_sections" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_workspace_team_idx" ON "documents" USING btree ("workspace_id","team_id");--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_team_visibility_pair";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_visibility_pair" CHECK (("documents"."visibility" = 'team' AND "documents"."team_id" IS NOT NULL AND "documents"."workspace_id" IS NOT NULL)
        OR ("documents"."visibility" <> 'team' AND "documents"."team_id" IS NULL));
