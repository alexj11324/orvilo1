import { AgentModel } from '@/database/models/agent';
import type { OrviloDatabase } from '@/database/type';
import type {
  AiGenerationJudgmentOptions,
  AiGenerationObjectInput,
} from '@/server/services/aiGeneration';
import { runAcpJudgment } from '@/server/services/aiGeneration/judgment';

/** All orchestration planning runs on the scope's Orchestrator device. */
export const generateOrchestrationWorkflowObject = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  _agentId: string | null | undefined,
  input: Omit<AiGenerationObjectInput, 'model' | 'provider'>,
  options: AiGenerationJudgmentOptions,
): Promise<unknown> => {
  const agentId = await new AgentModel(db, userId, workspaceId).getOrchestratorSourceAgentId();
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
};
