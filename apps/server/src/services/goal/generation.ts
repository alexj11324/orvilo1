import { resolveAgentRuntimeType } from '@orvilo/utils/agentRuntimeIdentity';

import { AgentModel } from '@/database/models/agent';
import type { OrviloDatabase } from '@/database/type';
import type {
  AiGenerationJudgmentOptions,
  AiGenerationObjectInput,
} from '@/server/services/aiGeneration';
import { AiGenerationService } from '@/server/services/aiGeneration';
import { runAcpJudgment } from '@/server/services/aiGeneration/judgment';

import { resolveGoalModelConfig } from './modelConfig';

/** CLI model IDs are runtime settings, never provider API model names. */
export const generateGoalObject = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  agentId: string | null | undefined,
  input: Omit<AiGenerationObjectInput, 'model' | 'provider'>,
  options: AiGenerationJudgmentOptions,
): Promise<unknown> => {
  const agent = agentId
    ? await new AgentModel(db, userId, workspaceId).getAgentConfig(agentId)
    : undefined;
  if (agent && resolveAgentRuntimeType(agent) !== 'orvilo') {
    const result = await runAcpJudgment(db, userId, {
      input: { messages: input.messages, schema: input.schema },
      judgment: {
        ...options.judgment,
        binding: { agentId },
        outputMode: 'tool',
        tracing: options.tracing,
      },
      workspaceId,
    });
    return result.data;
  }
  const model = await resolveGoalModelConfig(db, userId, agentId, workspaceId);
  return new AiGenerationService(db, userId, workspaceId).generateObject(
    { ...input, ...model },
    options,
  );
};
