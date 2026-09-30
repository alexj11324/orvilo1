'use client';

import type { TeamWorkflowStateItem } from '@orvilo/types';

import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

/**
 * The team's workflow-state catalog — the `workflowStateRefId`/`category`/
 * `name`/`color` half of the shared Issue status model (`teamId` comes from
 * the task, `domainRevision` from the write path). `null` while loading and
 * when no `teamId` is bound; surfaces keep their category fallback until a
 * non-empty catalog arrives.
 */
export const useTeamWorkflowStates = (teamId?: string | null): TeamWorkflowStateItem[] | null => {
  const { data } = useClientDataSWR(teamId ? ['team:workflowStates', teamId] : null, async () => {
    const result = await lambdaClient.team.team.query({ teamId: teamId! });
    return result.data.workflowStates ?? [];
  });
  return data ?? null;
};
