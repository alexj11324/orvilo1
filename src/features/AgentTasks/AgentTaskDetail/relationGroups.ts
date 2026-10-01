export type IssueRelationKind = 'blockedBy' | 'blocking' | 'relates';

/** Plane's relation order: what this issue blocks, what blocks it, then ordinary links. */
export const ISSUE_RELATION_KINDS: IssueRelationKind[] = ['blocking', 'blockedBy', 'relates'];

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
