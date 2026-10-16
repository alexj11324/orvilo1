ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "bound_device_row_id" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_bound_device_row_id_devices_id_fk";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_bound_device_row_id_devices_id_fk" FOREIGN KEY ("bound_device_row_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_bound_device_row_id_idx" ON "agents" USING btree ("bound_device_row_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "resolve_agent_device_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  selected_device uuid;
  stored_binding text;
  preserving_binding boolean := false;
BEGIN
  stored_binding := NEW.agency_config ->> 'boundDeviceId';
  IF jsonb_typeof(NEW.agency_config -> 'boundDeviceId') IS DISTINCT FROM 'string'
    OR coalesce(btrim(stored_binding), '') = ''
    OR coalesce(NEW.agency_config ->> 'executionTarget', '') NOT IN ('device', 'local') THEN
    RAISE EXCEPTION 'AGENT_HOST_REQUIRED: every Agent requires a registered device'
      USING ERRCODE = '23514', CONSTRAINT = 'agents_device_binding_required';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    preserving_binding := OLD.agency_config ->> 'boundDeviceId' = stored_binding
      AND NEW.user_id = OLD.user_id
      AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id
      AND NEW.visibility = OLD.visibility;
    IF preserving_binding AND OLD.bound_device_row_id IS NOT NULL THEN
      NEW.bound_device_row_id := OLD.bound_device_row_id;
      RETURN NEW;
    END IF;
  END IF;

  SELECT d.id INTO selected_device FROM public.devices d
  WHERE d.device_id = stored_binding
    AND (d.retired_at IS NULL OR preserving_binding)
    AND (
      (NEW.workspace_id IS NULL AND d.workspace_id IS NULL AND d.user_id = NEW.user_id)
      OR (NEW.workspace_id IS NOT NULL AND (
        (d.workspace_id = NEW.workspace_id AND (
          d.visibility = 'public' OR (NEW.visibility = 'private' AND d.user_id = NEW.user_id)
        ))
        OR (NEW.visibility = 'private' AND d.workspace_id IS NULL AND d.user_id = NEW.user_id)
      ))
    )
  ORDER BY (d.workspace_id IS NOT DISTINCT FROM NEW.workspace_id) DESC
  LIMIT 1 FOR SHARE;
  IF selected_device IS NULL THEN
    RAISE EXCEPTION 'AGENT_HOST_UNAVAILABLE: device is absent, retired or outside the Agent scope'
      USING ERRCODE = '23514', CONSTRAINT = 'agents_device_binding_required';
  END IF;
  NEW.bound_device_row_id := selected_device;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "agents_resolve_device_binding" ON "agents";--> statement-breakpoint
CREATE TRIGGER "agents_resolve_device_binding" BEFORE INSERT OR UPDATE ON "agents"
FOR EACH ROW EXECUTE FUNCTION "resolve_agent_device_binding"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "protect_bound_device_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agents a WHERE a.bound_device_row_id = OLD.id) THEN
    IF NEW.device_id IS DISTINCT FROM OLD.device_id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'DEVICE_IN_USE: an Agent references this device identity'
        USING ERRCODE = '23503', CONSTRAINT = 'agents_bound_device_row_id_devices_id_fk';
    END IF;
    IF NEW.retired_at IS NULL AND EXISTS (
      SELECT 1 FROM public.agents a WHERE a.bound_device_row_id = OLD.id AND NOT (
        (a.workspace_id IS NULL AND NEW.workspace_id IS NULL AND a.user_id = NEW.user_id)
        OR (a.workspace_id IS NOT NULL AND (
          (NEW.workspace_id = a.workspace_id AND (
            NEW.visibility = 'public' OR (a.visibility = 'private' AND a.user_id = NEW.user_id)
          ))
          OR (a.visibility = 'private' AND NEW.workspace_id IS NULL AND a.user_id = NEW.user_id)
        ))
      )
    ) THEN
      RAISE EXCEPTION 'DEVICE_IN_USE: device ownership or visibility would invalidate an Agent binding'
        USING ERRCODE = '23503', CONSTRAINT = 'agents_bound_device_row_id_devices_id_fk';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "devices_protect_agent_bindings" ON "devices";--> statement-breakpoint
CREATE TRIGGER "devices_protect_agent_bindings" BEFORE UPDATE ON "devices"
FOR EACH ROW EXECUTE FUNCTION "protect_bound_device_identity"();--> statement-breakpoint
-- Legacy rows are repaired by the resumable backfill; every new write is checked now.
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_device_binding_required";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_device_binding_required" CHECK ("agents"."bound_device_row_id" IS NOT NULL) NOT VALID;
