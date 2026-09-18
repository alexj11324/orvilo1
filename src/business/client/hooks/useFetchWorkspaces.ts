import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

import type { WorkspaceListItem } from './useActiveWorkspace';

export const WORKSPACE_LIST_KEY = 'teammates:workspaces';

/**
 * `workspace.list` — the caller's real memberships with role/plan context.
 * `useClientDataSWR` augments the key with the active workspace id, so the
 * cached copy is re-scoped on every workspace switch and a switch can't serve
 * another scope's membership snapshot. Exposes the full SWR response for
 * surfaces that owe the user loading / error / retry states; `useWorkspaces`
 * stays the array-shaped convenience read for existing callers.
 */
export const useFetchWorkspaces = () =>
  useClientDataSWR(WORKSPACE_LIST_KEY, async (): Promise<WorkspaceListItem[]> => {
    const workspaces = await lambdaClient.workspace.list.query();
    return workspaces as WorkspaceListItem[];
  });
