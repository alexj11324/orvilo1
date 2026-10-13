-- Preserve existing rows, identities, foreign keys and historical trace locations.
DO $$
DECLARE r record; renamed text; legacy_rows boolean := to_regclass('public.goals') IS NOT NULL;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND (tablename = 'goals' OR tablename LIKE 'goal\_%' ESCAPE '\')
  LOOP
    renamed := replace(r.tablename, 'goal', 'orchestration_workflow');
    IF to_regclass(format('public.%I', renamed)) IS NOT NULL THEN
      RAISE EXCEPTION 'Both legacy and renamed orchestration tables exist: %', r.tablename;
    END IF;
    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', r.tablename, renamed);
  END LOOP;

  FOR r IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND (column_name = 'goal' OR column_name LIKE 'goal\_%' ESCAPE '\')
  LOOP
    renamed := replace(r.column_name, 'goal', 'orchestration_workflow');
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.table_name, r.column_name, renamed);
  END LOOP;

  -- Renaming a primary/unique constraint also renames its backing index.
  FOR r IN SELECT c.conname, t.relname FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.conname LIKE '%goal%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
      r.relname, r.conname, left(replace(r.conname, 'goal', 'orchestration_workflow'), 63));
  END LOOP;
  FOR r IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%goal%'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
      r.indexname, left(replace(r.indexname, 'goal', 'orchestration_workflow'), 63));
  END LOOP;
  -- Only rows admitted by the legacy creation path inherit confirmation.
  -- A repeated migration must never approve newly created pending splits.
  IF legacy_rows THEN
    UPDATE orchestration_workflows
    SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('planConfirmedAt', coalesce(started_at, created_at))
    WHERE config ->> 'planConfirmedAt' IS NULL;
  END IF;
END $$;
--> statement-breakpoint
-- Only technical keys and reserved discriminator/tool values change. Prose,
-- stable entity ids (including old goal_ ids), and S3 keys keep their values.
CREATE OR REPLACE FUNCTION pg_temp.rename_orchestration_workflow_json(value jsonb, parent_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; entry record; renamed text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR entry IN SELECT * FROM jsonb_each(value) LOOP
      renamed := entry.key;
      -- Upstream Aegis/Prime objective fields are not orchestration entity keys.
      IF entry.key ~ '^(goal($|s$|[A-Z_])|Goal($|s$|[A-Z_])|GOAL($|S$|_))'
        AND entry.key <> 'goalClosure'
        AND NOT (entry.key = 'goal' AND jsonb_typeof(entry.value) = 'object' AND entry.value ? 'objective') THEN
        renamed := replace(replace(replace(entry.key, 'goal', 'orchestrationWorkflow'),
          'Goal', 'OrchestrationWorkflow'), 'GOAL', 'ORCHESTRATION_WORKFLOW');
      END IF;
      IF entry.key LIKE 'orvilo-goal%' THEN
        renamed := replace(entry.key, 'orvilo-goal', 'orvilo-orchestration-workflow');
      ELSIF entry.key LIKE 'goal\_%' ESCAPE '\' THEN
        renamed := replace(entry.key, 'goal_', 'orchestration_workflow_');
      END IF;
      result := result || jsonb_build_object(renamed, pg_temp.rename_orchestration_workflow_json(entry.value, entry.key));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.rename_orchestration_workflow_json(v, parent_key) ORDER BY ordinal), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS a(v, ordinal);
    RETURN result;
  ELSIF jsonb_typeof(value) = 'string' THEN
    renamed := value #>> '{}';
    IF (renamed IN ('goal', 'goals', 'goal_paused', 'goal_terminal', 'goal_status') AND parent_key IN ('subjectType', 'entityType', 'trigger', 'kind', 'resourceType', 'outcome', 'type'))
      OR (renamed IN ('createGoal', 'inspectGoal', 'getGoalContext') AND parent_key IN ('apiName', 'name', 'api'))
      OR ((renamed LIKE 'orvilo-goal%' OR renamed LIKE '@orvilo/builtin-tool-goal%')
        AND parent_key IN ('identifier', 'name', 'toolName', 'pluginId', 'toolId', 'toolIdentifier', 'plugins', 'tools', 'requiredTools', 'requiredToolIds', 'exclusivePluginIds', 'selectedToolIds', 'additionalPluginIds'))
      OR (renamed LIKE 'goal.%' AND parent_key IN ('purpose', 'generationPurpose', 'planningPurpose')) THEN
      renamed := replace(replace(renamed, 'builtin-tool-goal', 'builtin-tool-orchestration-workflow'),
        'orvilo-goal', 'orvilo-orchestration-workflow');
      renamed := replace(renamed, 'goal_', 'orchestration_workflow_');
      renamed := replace(replace(renamed, 'goal', 'orchestrationWorkflow'), 'Goal', 'OrchestrationWorkflow');
      renamed := replace(renamed, 'createOrchestrationWorkflow', 'startOrchestrationWorkflow');
      RETURN to_jsonb(renamed);
    END IF;
  END IF;
  RETURN value;
END $$;
--> statement-breakpoint
DO $$
DECLARE r record; has_legacy_value boolean;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'jsonb' AND is_generated = 'NEVER'
      AND (table_name, column_name) IN (
        ('orchestration_workflows', 'config'),
        ('orchestration_workflow_traces', 'ticks_by_branch'),
        ('agents', 'plugins'), ('agents', 'agency_config'), ('agents', 'chat_config'),
        ('agent_operations', 'app_context'), ('agent_operations', 'metadata'), ('agent_operations', 'model_runtime_config'),
        ('messages', 'tools'), ('messages', 'metadata'), ('message_plugins', 'state'), ('message_plugins', 'intervention'),
        ('tasks', 'config'), ('task_topics', 'contract'), ('task_topics', 'handoff'),
        ('verify_runs', 'metadata'), ('verify_runs', 'plan'), ('acceptances', 'config'),
        ('user_settings', 'system_agent'), ('user_settings', 'default_agent'), ('user_settings', 'tool'),
        ('event_outbox', 'payload'), ('trash_items', 'meta')
      )
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = pg_temp.rename_orchestration_workflow_json(%I, %L)
      WHERE %I::text ~ ''[gG][oO][aA][lL]''', r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
  END LOOP;
  FOR r IN SELECT table_name, column_name, character_maximum_length FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')
      AND (table_name, column_name) IN (
        ('metrics', 'subject_type'), ('orchestration_workflow_events', 'entity_type'),
        ('task_topics', 'trigger'), ('briefs', 'trigger'), ('trash_items', 'resource_type'),
        ('event_outbox', 'aggregate_type')
      )
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = ''goal'')',
      r.table_name, r.column_name) INTO has_legacy_value;
    IF has_legacy_value THEN
      IF r.character_maximum_length IS NOT NULL AND r.character_maximum_length < length('orchestrationWorkflow') THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE text', r.table_name, r.column_name);
      END IF;
      EXECUTE format('UPDATE public.%I SET %I = ''orchestrationWorkflow'' WHERE %I = ''goal''',
        r.table_name, r.column_name, r.column_name);
    END IF;
  END LOOP;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.orchestration_workflow_nodes') IS NOT NULL THEN
    UPDATE orchestration_workflow_nodes SET title = 'Complete full Orchestration workflow acceptance'
      WHERE title = 'Complete full Goal acceptance';
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    UPDATE tasks SET name = 'Complete full Orchestration workflow acceptance'
      WHERE name = 'Complete full Goal acceptance';
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    UPDATE tasks SET error = 'Orchestration workflow Task operation lease expired.'
      WHERE error = 'Goal Task operation lease expired.';
  END IF;
  IF to_regclass('public.orchestration_workflow_events') IS NOT NULL THEN
    UPDATE orchestration_workflow_events SET event_type = 'orchestration_workflow_status' WHERE event_type = 'goal_status';
    UPDATE orchestration_workflow_events SET actor_id = 'orchestration-workflow-coordinator' WHERE actor_id = 'goal-coordinator';
  END IF;
  IF to_regclass('public.message_plugins') IS NOT NULL THEN
    UPDATE message_plugins SET identifier = replace(identifier, 'orvilo-goal', 'orvilo-orchestration-workflow'),
      api_name = replace(replace(api_name, 'Goal', 'OrchestrationWorkflow'), 'createOrchestrationWorkflow', 'startOrchestrationWorkflow')
      WHERE identifier IN ('orvilo-goal', 'orvilo-goal-supervisor')
        OR (identifier = 'orvilo-task' AND api_name = 'createGoal');
  END IF;
END $$;
