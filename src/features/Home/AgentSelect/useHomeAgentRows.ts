'use client';

import { BUILTIN_AGENT_SLUGS, isBuiltinAgentAvailable } from '@orvilo/builtin-agents';
import { agentDisplayName, agentSecondaryDisplayName, type SidebarAgentItem } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { DEFAULT_INBOX_AVATAR } from '@/const/meta';
import { useBuiltinHarnessOffered } from '@/features/HeterogeneousAgent/builtinHarness';
import {
  useKeepSidebarGroupsListed,
  useKeepSidebarListed,
} from '@/features/HomeSidebar/Body/Agent/List/useAgentList';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

export interface AgentRow {
  avatar?: string;
  backgroundColor?: string;
  heterogeneousType?: SidebarAgentItem['heterogeneousType'];
  id: string;
  pinned?: boolean;
  subtitle?: string;
  title: string;
}

export interface HomeAgentRows {
  /** Workspace-private items owned by the caller. Always empty in personal mode. */
  privateRows: AgentRow[];
  /** Whether to render the 私人 / 工作区 section split. */
  showPrivateSection: boolean;
  /** Inbox + workspace-visible items. */
  workspaceRows: AgentRow[];
}

/**
 * Rows for the home Agent switcher, bucketed the same way the sidebar and the
 * agent-detail switcher bucket theirs: private first, then workspace, each in
 * pinned → folders → ungrouped order. Kept out of the component so the
 * bucketing is unit-testable.
 */
export const useHomeAgentRows = (): HomeAgentRows => {
  const { t } = useTranslation(['chat', 'topic']);

  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const inboxMeta = useAgentStore(agentSelectors.getAgentMetaById(inboxAgentId ?? ''));

  const pinnedAgents = useHomeStore(homeAgentListSelectors.pinnedAgents, isEqual);
  const agentGroups = useHomeStore(homeAgentListSelectors.agentGroups, isEqual);
  const ungroupedAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents, isEqual);
  const privatePinnedAgents = useHomeStore(homeAgentListSelectors.privatePinnedAgents, isEqual);
  const privateAgentGroups = useHomeStore(homeAgentListSelectors.privateAgentGroups, isEqual);
  const privateUngroupedAgents = useHomeStore(
    homeAgentListSelectors.privateUngroupedAgents,
    isEqual,
  );

  const activeWorkspaceId = useActiveWorkspaceId();

  // Per-item sidebar membership was retired with the fixed IA — keep() is an
  // identity seam shared with the other list-shaping call sites.
  const keep = useKeepSidebarListed();
  // The inbox is a virtual row on the built-in harness.
  const builtinOffered = useBuiltinHarnessOffered();
  const keepGroups = useKeepSidebarGroupsListed();

  return useMemo(() => {
    const seen = new Set<string>();

    // An agent can sit in several buckets (pinned AND inside a folder), so
    // de-duplicate by id across every bucket.
    const collect = (buckets: SidebarAgentItem[][]): AgentRow[] => {
      const out: AgentRow[] = [];
      for (const bucket of buckets) {
        for (const item of keep(bucket)) {
          // Skip chat groups — sendMessage / agent config lookups expect an agent id.
          // Groups go through their own chat-group flow under /group/:gid.
          if (item.type !== 'agent') continue;
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          out.push({
            avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
            backgroundColor: item.backgroundColor || undefined,
            heterogeneousType: item.heterogeneousType,
            id: item.id,
            pinned: item.pinned ?? false,
            subtitle: agentSecondaryDisplayName(item),
            title: agentDisplayName(item, t('untitledAgent')),
          });
        }
      }
      return out;
    };

    const privateRows = collect([
      privatePinnedAgents,
      keepGroups(privateAgentGroups).flatMap((group) => group.items),
      privateUngroupedAgents,
    ]);

    const workspaceRows: AgentRow[] = [];
    if (
      builtinOffered &&
      isBuiltinAgentAvailable(BUILTIN_AGENT_SLUGS.inbox) &&
      inboxAgentId &&
      !seen.has(inboxAgentId)
    ) {
      seen.add(inboxAgentId);
      workspaceRows.push({
        avatar:
          (typeof inboxMeta?.avatar === 'string' ? inboxMeta.avatar : undefined) ??
          DEFAULT_INBOX_AVATAR,
        backgroundColor: inboxMeta?.backgroundColor || undefined,
        id: inboxAgentId,
        title: agentDisplayName(inboxMeta, 'Orvilo AI'),
      });
    }
    workspaceRows.push(
      ...collect([
        pinnedAgents,
        keepGroups(agentGroups).flatMap((group) => group.items),
        ungroupedAgents,
      ]),
    );

    return {
      privateRows,
      // Same rule as the agent-detail SwitchPanel: only split into 私人 / 工作区
      // when there is a workspace AND private items exist — a lone header
      // above an empty section is noise.
      showPrivateSection: Boolean(activeWorkspaceId) && privateRows.length > 0,
      workspaceRows,
    };
  }, [
    activeWorkspaceId,
    agentGroups,
    builtinOffered,
    inboxAgentId,
    inboxMeta,
    keep,
    keepGroups,
    pinnedAgents,
    privateAgentGroups,
    privatePinnedAgents,
    privateUngroupedAgents,
    t,
    ungroupedAgents,
  ]);
};
