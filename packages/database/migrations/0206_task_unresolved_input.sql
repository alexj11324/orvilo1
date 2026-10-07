CREATE OR REPLACE FUNCTION has_task_unresolved_input(p_task_id text, p_operation_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
    JOIN task_topics tt ON tt.task_id = t.id AND tt.topic_id = t.current_topic_id
    JOIN agent_operations op ON op.id = tt.operation_id AND op.task_id = t.id
    WHERE t.id = p_task_id
      AND (p_operation_id IS NULL OR op.id = p_operation_id)
      AND (tt.execution_generation = t.execution_generation OR tt.execution_generation IS NULL)
      AND (
        EXISTS (
          SELECT 1 FROM agent_interventions i
          LEFT JOIN agent_intervention_resolutions r ON r.id = i.resolution_id
          WHERE i.operation_id = op.id AND i.interaction_kind = 'question'
            AND NOT coalesce((
              i.status = 'resolved' AND (
                (i.source = 'heterogeneous' AND i.producer_ack_at IS NOT NULL)
                OR (i.source = 'runtime' AND r.continuation_started_at IS NOT NULL)
              )
            ), false)
        )
        OR EXISTS (
          SELECT 1 FROM messages m JOIN message_plugins p ON p.id = m.id
          WHERE m.topic_id = tt.topic_id AND m.deleted_at IS NULL
            AND p.api_name = 'askUserQuestion'
            AND (
              coalesce(m.metadata ->> 'heterogeneousToolStateOperationId', p.intervention ->> 'operationId') = op.id
              OR (
                coalesce(m.metadata ->> 'heterogeneousToolStateOperationId', p.intervention ->> 'operationId') IS NULL
                AND (
                  m.metadata ->> 'heteroSessionId' = op.metadata #>> '{remoteAdmission,acpSessionId}'
                  OR m.created_at >= op.started_at
                )
              )
            )
            AND NOT coalesce((
              p.intervention ->> 'status' = 'approved'
              AND p.state #>> '{heterogeneousIntervention,transition}' = 'resolved'
              AND nullif(p.state #>> '{heterogeneousIntervention,resolutionRequestId}', '') IS NOT NULL
            ), false)
            AND NOT EXISTS (
              SELECT 1 FROM agent_interventions i
              LEFT JOIN agent_intervention_resolutions r ON r.id = i.resolution_id
              WHERE i.operation_id = op.id AND i.tool_call_id = p.tool_call_id
                AND i.interaction_kind = 'question' AND i.status = 'resolved'
                AND (
                  (i.source = 'heterogeneous' AND i.producer_ack_at IS NOT NULL)
                  OR (i.source = 'runtime' AND r.continuation_started_at IS NOT NULL)
                )
            )
        )
      )
  );
$$;
