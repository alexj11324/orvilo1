import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import type { ProviderConfig } from '@orvilo/types';
import { pickTrimmedString, toRecord } from '@orvilo/utils/object';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { AiInfraRepos } from '@/database/repositories/aiInfra';
import type { OrviloDatabase } from '@/database/type';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { resolveGoalModelConfig } from '@/server/services/goal/modelConfig';

import type { VerifyModelConfig } from './modelConfig';
import { isHeterogeneousVerifyProvider, REVIEW_PREDICT_MODEL_CONFIG } from './modelConfig';

/** Resolve within the task owner's scope; never select an arbitrary enabled model. */
export const resolveGoalReviewModelConfig = async (
  db: OrviloDatabase,
  userId: string,
  params: { requiresVision: boolean; taskId: string; verifierAgentId?: string | null },
  workspaceId?: string,
): Promise<VerifyModelConfig | undefined> => {
  const agents = new AgentModel(db, userId, workspaceId);
  const { aiProvider } = await getServerGlobalConfig();
  const providerConfigs: Record<string, ProviderConfig> = Object.fromEntries(
    Object.entries(aiProvider).map<[string, ProviderConfig]>(([id, config]) => [
      id,
      { ...config, enabled: config?.enabled ?? false },
    ]),
  );
  const infra = new AiInfraRepos(providerConfigs);
  const tried = new Set<string>();
  const usable = async (candidate?: { model?: string | null; provider?: string | null } | null) => {
    if (
      !candidate?.model ||
      !candidate.provider ||
      isHeterogeneousVerifyProvider(candidate.provider)
    )
      return;
    const config = { model: candidate.model, provider: candidate.provider };
    const key = JSON.stringify(config);
    if (tried.has(key)) return;
    tried.add(key);
    if (params.requiresVision) {
      const models = await infra.getAiProviderModelList(config.provider, { type: 'chat' });
      if (!models.some((model) => model.id === config.model && model.abilities?.vision)) return;
    }
    // The review judgment runs as an authorized ACP operation — the deployment
    // provider credentials are never probed or used here (R08). The resolved
    // config is only the recorded identity of the reviewing model.
    return config;
  };

  if (params.verifierAgentId) {
    const configured = await usable(await agents.getAgentModelConfig(params.verifierAgentId));
    if (configured) return configured;
  }
  const pinned = await usable(REVIEW_PREDICT_MODEL_CONFIG);
  if (pinned) return pinned;
  const builtin = await usable(await agents.getAgentModelConfig(BUILTIN_AGENT_SLUGS.verifyAgent));
  if (builtin) return builtin;

  // Program checks may never have needed a verifier model. Fall back to the
  // task's configured model, then the user's Goal system-agent configuration.
  const task = await new TaskModel(db, userId, workspaceId).findById(params.taskId);
  const taskConfig = toRecord(task?.config);
  const taskModel = await usable({
    model: pickTrimmedString(taskConfig?.model),
    provider: pickTrimmedString(taskConfig?.provider),
  });
  if (taskModel) return taskModel;
  if (task?.assigneeAgentId) {
    const assigned = await usable(await agents.getAgentModelConfig(task.assigneeAgentId));
    if (assigned) return assigned;
  }
  return usable(await resolveGoalModelConfig(db, userId));
};
