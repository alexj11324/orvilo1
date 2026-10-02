import { numberedAgentName } from '@orvilo/const';
import { getHeterogeneousTypeLabel } from '@orvilo/heterogeneous-agents';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

const BUILTIN_AGENT_NAME = 'Orvilo AI';

/**
 * One-click naming for an agent that never got a personal name — agents created
 * before names existed, or through a path that doesn't seed one (REST, group
 * members). Uses the same deterministic scheme as agent creation: the agent's
 * own type name (product title for heterogeneous agents, its title when it has
 * one, "Orvilo AI" for builtin agents), numbered when the sidebar already has
 * one — "Claude Code", "Claude Code 2", ...
 *
 * The list is read at click time rather than subscribed to — it only matters at
 * the moment of the draw, and subscribing would re-render the header on every
 * sidebar change.
 */
export const useAutoName = (agentId: string) => {
  const { t } = useTranslation('setting');
  const updateMetaById = useAgentStore((s) => s.updateAgentMetaById);
  const refreshAgentList = useHomeStore((s) => s.refreshAgentList);
  const [naming, setNaming] = useState(false);

  const autoName = useCallback(async () => {
    setNaming(true);
    try {
      const agents = homeAgentListSelectors.allAgents(useHomeStore.getState());
      const agent = agents.find((a) => a.id === agentId);
      const takenNames = agents
        .filter((a) => a.id !== agentId)
        .map((a) => a.name)
        .filter((name): name is string => !!name);
      const base =
        agent?.title?.trim() ||
        (agent?.heterogeneousType
          ? getHeterogeneousTypeLabel(agent.heterogeneousType)
          : undefined) ||
        BUILTIN_AGENT_NAME;

      await updateMetaById(agentId, { name: numberedAgentName(base, takenNames) });
      // The sidebar keeps its own copy of the label, so a rename that skips this
      // leaves the new name on the profile and the old one in the list until
      // something else revalidates. Refreshing here follows the same convention
      // as the sidebar's own rename popover.
      await refreshAgentList();
    } catch {
      toast.error(t('settingAgent.personalName.pickFailed'));
    } finally {
      setNaming(false);
    }
  }, [agentId, refreshAgentList, t, updateMetaById]);

  return { autoName, naming };
};
