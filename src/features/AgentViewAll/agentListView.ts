export type AgentListView = 'empty' | 'error' | 'list' | 'loading';

interface ResolveAgentListViewInput {
  /** The thrown SWR error from the agent list request, if any. */
  error?: unknown;
  /** `isAgentListInit` — flips to true only after the first successful load. */
  isInit: boolean;
  itemCount: number;
}

/**
 * Which body the agent list page renders. `isInit` flips only on success, so a
 * failed first load must be told apart from a pending one or the skeleton
 * never goes away. Once loaded, a failed refresh keeps the stale list.
 */
export const resolveAgentListView = ({
  error,
  isInit,
  itemCount,
}: ResolveAgentListViewInput): AgentListView => {
  if (!isInit) return error ? 'error' : 'loading';

  return itemCount === 0 ? 'empty' : 'list';
};
