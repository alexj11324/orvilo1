import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

interface TaskVerifyModelOptions {
  assigneeAgentId?: string | null;
  taskModel?: string | null;
  taskProvider?: string | null;
}

/** Resolve the generation model independently of the Issue body's loading state. */
export const useTaskVerifyModel = ({
  assigneeAgentId,
  taskModel,
  taskProvider,
}: TaskVerifyModelOptions) => {
  const agentId = useAgentStore((s) => assigneeAgentId || s.activeAgentId || '');
  const isLogin = useUserStore(authSelectors.isLogin);
  const useHydrateAgentConfig = useAgentStore((s) => s.useHydrateAgentConfig);
  const { isLoading } = useHydrateAgentConfig(isLogin, agentId);
  const hasAgentConfig = useAgentStore((s) => !!s.agentMap[agentId]);
  const agentModel = useAgentStore((s) => agentByIdSelectors.getAgentModelById(agentId)(s));
  const agentProvider = useAgentStore((s) =>
    agentByIdSelectors.getAgentModelProviderById(agentId)(s),
  );
  // These selectors supply global defaults even before this agent is hydrated.
  // Only a resolved target config can supply fields not explicitly set on the Issue.
  const model = taskModel || (hasAgentConfig ? agentModel : '');
  const provider = taskProvider || (hasAgentConfig ? agentProvider : '');
  const isReady = !!model && !!provider;

  return { isLoading: !isReady && !!isLoading, isReady, model, provider };
};
