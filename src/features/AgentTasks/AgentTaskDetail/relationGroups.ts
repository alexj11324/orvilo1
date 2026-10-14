export type IssueRelationKind = 'blockedBy' | 'blocking' | 'relates';

/** Linear's sidebar order: what blocks this issue, what it blocks, then ordinary links. */
export const ISSUE_RELATION_KINDS: IssueRelationKind[] = ['blockedBy', 'blocking', 'relates'];

/**
 * The Related rail's row budget. Linear folds a long related list behind one
 * "Show N more" expander; five rows is the most that still reads as a glance.
 */
export const RELATED_VISIBLE_LIMIT = 5;

export interface CollapsedRelationRows<Edge> {
  /** Rows still behind the expander — the N in "Show N more". */
  hiddenCount: number;
  /** What each kind renders while collapsed, in `ISSUE_RELATION_KINDS` order. */
  visible: Record<IssueRelationKind, Edge[]>;
}

/**
 * Fold a kind-grouped relation list down to `limit` rows. Kinds keep sidebar
 * order, so an early kind can spend the whole budget and a later one can fall
 * entirely behind the fold; expanding returns every row untouched.
 */
export const collapseRelationRows = <Edge>(
  grouped: Record<IssueRelationKind, readonly Edge[]>,
  expanded: boolean,
  limit = RELATED_VISIBLE_LIMIT,
): CollapsedRelationRows<Edge> => {
  const visible = { blockedBy: [], blocking: [], relates: [] } as Record<IssueRelationKind, Edge[]>;
  let budget = limit;
  let total = 0;
  let shown = 0;
  for (const kind of ISSUE_RELATION_KINDS) {
    const rows = grouped[kind];
    total += rows.length;
    const take = expanded ? rows.length : Math.min(rows.length, Math.max(budget, 0));
    visible[kind] = rows.slice(0, take);
    budget -= take;
    shown += take;
  }
  return { hiddenCount: total - shown, visible };
};

export const relationKindOf = (dep: {
  direction?: 'blockedBy' | 'blocking';
  type: string;
}): IssueRelationKind | null => {
  if (dep.type === 'relates') return 'relates';
  if (dep.type !== 'blocks') return null;
  return dep.direction === 'blocking' ? 'blocking' : 'blockedBy';
};

/** A run waits on outgoing blockers that are not completed. Incoming "blocking" rows do not. */
export const isOpenBlocker = (dep: {
  direction?: 'blockedBy' | 'blocking';
  status?: string | null;
  type: string;
}) => relationKindOf(dep) === 'blockedBy' && dep.status !== 'completed';
