'use client';

import isEqual from 'fast-deep-equal';
import { useMemo } from 'react';

import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

/**
 * Per-item sidebar membership was retired with the fixed sidebar IA — the
 * sidebar no longer lists per-agent rows, so every visible item stays listed
 * everywhere. The helper survives as an identity filter so the list-shaping
 * call sites keep one seam.
 */
export const useKeepSidebarListed = () =>
  useMemo(
    () =>
      <T,>(items: T[]) =>
        items,
    [],
  );

/**
 * Folder visibility went away with the per-item preference — categories are
 * always listed.
 */
export const useKeepSidebarGroupsListed = () =>
  useMemo(
    () =>
      <T extends { id: string }>(groups: T[]) =>
        groups,
    [],
  );

// SWR subscription is owned by the caller of AgentListContent (Body/Agent
// accordion, or the standalone SwitchPanel). Subscribing here would re-fetch
// on every accordion expand and flash spinners across the sidebar.
export const useAgentList = (limitDefault = true) => {
  const agentPageSize = useGlobalStore(systemStatusSelectors.agentPageSize);
  const ungroupedAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents, isEqual);
  const agentGroups = useHomeStore(homeAgentListSelectors.agentGroups, isEqual);
  const pinnedAgents = useHomeStore(homeAgentListSelectors.pinnedAgents, isEqual);
  const privateAgentGroups = useHomeStore(homeAgentListSelectors.privateAgentGroups, isEqual);
  const privateUngroupedAgents = useHomeStore(
    homeAgentListSelectors.privateUngroupedAgents,
    isEqual,
  );
  const keep = useKeepSidebarListed();
  const keepGroups = useKeepSidebarGroupsListed();

  return useMemo(() => {
    const filteredUngrouped = keep(ungroupedAgents);

    return {
      customList: keepGroups(agentGroups).map((group) => ({ ...group, items: keep(group.items) })),
      // Filter BEFORE the page-size cut so an unpin doesn't shrink the page.
      defaultList: limitDefault ? filteredUngrouped.slice(0, agentPageSize) : filteredUngrouped,
      pinnedList: keep(pinnedAgents),
      privateGroupList: keepGroups(privateAgentGroups).map((group) => ({
        ...group,
        items: keep(group.items),
      })),
      privateUngroupedList: keep(privateUngroupedAgents),
    };
  }, [
    agentGroups,
    agentPageSize,
    keep,
    keepGroups,
    limitDefault,
    pinnedAgents,
    ungroupedAgents,
    privateAgentGroups,
    privateUngroupedAgents,
  ]);
};
