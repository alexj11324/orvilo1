export type AgentGroupBy = 'author' | 'label' | 'none';
export type AgentOrderBy = 'author' | 'title' | 'updatedAt';
export type AgentOrderDirection = 'asc' | 'desc';
export type AgentListViewMode = 'card' | 'list';

/**
 * The row layout is a desktop table — its fixed columns cannot fit a mobile
 * viewport (the table itself overflows, forcing horizontal scroll). Small
 * viewports fall back to the card grid, which already stacks to one column.
 */
export const resolveAgentViewMode = (
  viewMode: AgentListViewMode | undefined,
  isMobileViewport: boolean,
): AgentListViewMode => (isMobileViewport ? 'card' : (viewMode ?? 'list'));

export interface AgentListViewOptions {
  groupBy: AgentGroupBy;
  orderBy: AgentOrderBy;
  orderDirection: AgentOrderDirection;
}

export const DEFAULT_AGENT_LIST_VIEW_OPTIONS: AgentListViewOptions = {
  groupBy: 'none',
  orderBy: 'updatedAt',
  orderDirection: 'desc',
};

const AGENT_GROUP_BY_SET = new Set<AgentGroupBy>(['author', 'label', 'none']);
const AGENT_ORDER_BY_SET = new Set<AgentOrderBy>(['author', 'title', 'updatedAt']);
const AGENT_ORDER_DIRECTION_SET = new Set<AgentOrderDirection>(['asc', 'desc']);

export const normalizeAgentListViewOptions = (
  value?: Partial<AgentListViewOptions> | null,
): AgentListViewOptions => {
  const next = value ?? {};
  return {
    groupBy: AGENT_GROUP_BY_SET.has(next.groupBy as AgentGroupBy)
      ? (next.groupBy as AgentGroupBy)
      : DEFAULT_AGENT_LIST_VIEW_OPTIONS.groupBy,
    orderBy: AGENT_ORDER_BY_SET.has(next.orderBy as AgentOrderBy)
      ? (next.orderBy as AgentOrderBy)
      : DEFAULT_AGENT_LIST_VIEW_OPTIONS.orderBy,
    orderDirection: AGENT_ORDER_DIRECTION_SET.has(next.orderDirection as AgentOrderDirection)
      ? (next.orderDirection as AgentOrderDirection)
      : DEFAULT_AGENT_LIST_VIEW_OPTIONS.orderDirection,
  };
};
