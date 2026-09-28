import { useCallback, useMemo } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

/**
 * Accordion value of one team row in "Your teams" — the same vocabulary the
 * persisted buckets use.
 */
export const teamAccordionKey = (teamId: string) => `team:${teamId}`;

/** Linear's rule: every team shows its sub-navigation until YOU fold it away. */
export const resolveExpandedTeamKeys = (teamKeys: string[], collapsedKeys: string[]): string[] =>
  teamKeys.filter((key) => !collapsedKeys.includes(key));

/**
 * The complement to persist for an open set. Always derived from the full
 * roster, so a fold is recorded and entries of teams that are no longer listed
 * are dropped in the same write.
 */
export const resolveCollapsedTeamKeys = (
  teamKeys: string[],
  openKeys: Iterable<unknown>,
): string[] => {
  const open = new Set(Array.from(openKeys, String));
  return teamKeys.filter((key) => !open.has(key));
};

/**
 * Expansion state of the "Your teams" sub-navigation, in the ACTIVE scope
 * (`updateSystemStatus` routes the write into the workspace overlay when inside
 * a workspace, so personal-mode preferences stay untouched).
 *
 * The persisted preference is the FOLDED set, not the open one. An open set
 * stored under `sidebarExpandedKeys` can only ever list teams that existed when
 * it was written: every team joined afterwards — and every team of an account
 * whose saved keys predate the sub-navigation — comes back folded with no way
 * to unfold it, which is exactly how the section shipped broken. Folding is the
 * deliberate act, so folding is what gets remembered.
 */
export const useTeamSubNav = (teamKeys: string[]) => {
  const activeWorkspaceId = useActiveWorkspaceId();
  const collapsedKeys = useGlobalStore(
    systemStatusSelectors.sidebarCollapsedKeys(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const expandedTeamKeys = useMemo(
    () => resolveExpandedTeamKeys(teamKeys, collapsedKeys),
    [teamKeys, collapsedKeys],
  );

  const setExpandedTeamKeys = useCallback(
    (keys: unknown) => {
      updateSystemStatus({
        sidebarCollapsedKeys: resolveCollapsedTeamKeys(teamKeys, (keys as string[]) ?? []),
      });
    },
    [teamKeys, updateSystemStatus],
  );

  return { expandedTeamKeys, setExpandedTeamKeys };
};
