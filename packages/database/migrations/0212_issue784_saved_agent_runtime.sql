ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_workspace_id_workspaces_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "devices_workspace_id_device_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "devices_workspace_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "devices_workspace_visibility_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "topics_model_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "topics_provider_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "devices_user_id_device_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_device_id_unique" ON "devices" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_user_id_device_id_unique" ON "devices" USING btree ("user_id","device_id");--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "workspace_id";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "visibility";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "shared_from_device_id";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "model";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "provider";
