import { HETEROGENEOUS_AGENT_MODEL_IDS } from '@orvilo/const';
import { sql } from 'drizzle-orm';

import { agents, topics } from '../schemas';

/** Orvilo memory belongs to its builtin harness; ACP runtimes own their native memory. */
export const builtinMemoryTopic = () => sql`
  COALESCE(${topics.metadata}->>'heteroSessionId', '') = ''
  AND COALESCE(${topics.metadata}->>'heteroSourceEndAt', '') = ''
  AND NOT EXISTS (
    SELECT 1 FROM ${agents} AS memory_agent
    WHERE memory_agent.id = ${topics.agentId}
    AND CASE
      WHEN COALESCE(memory_agent.agency_config->'heterogeneousProvider', 'null'::jsonb) <> 'null'::jsonb
        THEN COALESCE(memory_agent.agency_config->'heterogeneousProvider'->>'type', '') <> 'orvilo'
      ELSE COALESCE(memory_agent.model, '') IN (${sql.join(
        HETEROGENEOUS_AGENT_MODEL_IDS.map((model) => sql`${model}`),
        sql`, `,
      )})
    END
  )`;
