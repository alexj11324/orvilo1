/**
 * Logic shared by the two places an Issue is linked to existing Issues: the
 * "Mark as" / "Add existing sub-issues" dialog and the relation fields in the
 * properties rail. Components only render what these functions decide.
 */

export type MarkIssueRelationKind =
  'parentOf' | 'subIssueOf' | 'relatedTo' | 'blockedBy' | 'blocking' | 'duplicateOf';

export interface RelationCandidate {
  id: string;
  identifier: string;
  /** Present when the Issue already sits under another parent. */
  parentIdentifier?: string | null;
  title: string;
}

/**
 * One Issue has one parent and one duplicate target, so those two pick a
 * single Issue and commit on the click. Everything else collects a selection.
 */
export const isMultiSelectRelation = (kind: MarkIssueRelationKind): boolean =>
  kind !== 'subIssueOf' && kind !== 'duplicateOf';

/** Which `workAttention.search` eligibility filter a picker asks the server for. */
export const relationSearchEligibility = (
  kind: MarkIssueRelationKind,
): 'child' | 'dependency' | 'parent' | undefined => {
  if (kind === 'parentOf') return 'child';
  if (kind === 'subIssueOf') return 'parent';
  // A duplicate target may sit in any project; the server has no project rule for it.
  if (kind === 'duplicateOf') return undefined;
  return 'dependency';
};

export const toggleRelationCandidate = (
  selected: readonly RelationCandidate[],
  candidate: RelationCandidate,
): RelationCandidate[] =>
  selected.some((item) => item.id === candidate.id)
    ? selected.filter((item) => item.id !== candidate.id)
    : [...selected, candidate];

/**
 * Rows the picker lists: the current matches, preceded by picked Issues the
 * current search no longer returns, so a selection never disappears from view.
 */
export const relationPickerRows = (
  selected: readonly RelationCandidate[],
  hits: readonly RelationCandidate[],
): RelationCandidate[] => {
  const hitIds = new Set(hits.map((hit) => hit.id));
  return [...selected.filter((item) => !hitIds.has(item.id)), ...hits];
};

/** Stable reasons the server attaches to a refused relation or parent write. */
const RELATION_REJECTION_CODES = [
  'ALREADY_BLOCKING',
  'CROSS_PROJECT',
  'CYCLE',
  'SELF',
  'UNAVAILABLE',
  'UNFINISHED_PREREQUISITE',
] as const;

export type RelationRejectionCode = (typeof RELATION_REJECTION_CODES)[number];

/** Reads the reason the tRPC error formatter forwards as `data.errorData.code`. */
export const relationRejectionCode = (error: unknown): RelationRejectionCode | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { data?: { errorData?: { code?: unknown } } }).data?.errorData?.code;
  return RELATION_REJECTION_CODES.find((known) => known === code);
};

export type RelationRejectionKey =
  | 'taskDetail.relationError.alreadyBlocking'
  | 'taskDetail.relationError.crossProject'
  | 'taskDetail.relationError.dependencyCycle'
  | 'taskDetail.relationError.parentCycle'
  | 'taskDetail.relationError.self'
  | 'taskDetail.relationError.unavailable'
  | 'taskDetail.relationError.unfinishedPrerequisite';

/**
 * The copy for a refused write. A cycle reads differently for a parent link
 * (the tree) than for a blocking link (the run order), so the caller says
 * which it attempted. Unknown failures return nothing — the caller falls back
 * to the server's own message.
 */
export const relationRejectionKey = (
  error: unknown,
  link: 'dependency' | 'parent',
): RelationRejectionKey | undefined => {
  switch (relationRejectionCode(error)) {
    case 'ALREADY_BLOCKING': {
      return 'taskDetail.relationError.alreadyBlocking';
    }
    case 'CROSS_PROJECT': {
      return 'taskDetail.relationError.crossProject';
    }
    case 'CYCLE': {
      return link === 'parent'
        ? 'taskDetail.relationError.parentCycle'
        : 'taskDetail.relationError.dependencyCycle';
    }
    case 'SELF': {
      return 'taskDetail.relationError.self';
    }
    case 'UNAVAILABLE': {
      return 'taskDetail.relationError.unavailable';
    }
    case 'UNFINISHED_PREREQUISITE': {
      return 'taskDetail.relationError.unfinishedPrerequisite';
    }
    default: {
      return undefined;
    }
  }
};

export interface RelationWriteFailure {
  candidate: RelationCandidate;
  error: unknown;
}

/**
 * Relations are separate edges, so several are written one after another and
 * each can be refused on its own. Every candidate is attempted; the caller
 * gets what landed and what did not, never an all-or-nothing guess.
 */
export const writeRelationsOneByOne = async (
  candidates: readonly RelationCandidate[],
  write: (candidate: RelationCandidate) => Promise<unknown>,
): Promise<{ added: RelationCandidate[]; failed: RelationWriteFailure[] }> => {
  const added: RelationCandidate[] = [];
  const failed: RelationWriteFailure[] = [];
  for (const candidate of candidates) {
    try {
      await write(candidate);
      added.push(candidate);
    } catch (error) {
      failed.push({ candidate, error });
    }
  }
  return { added, failed };
};

/**
 * The Issue an "unfinished prerequisite" refusal is about: the one that would
 * have gained the prerequisite. Marking this Issue as blocking another puts
 * the prerequisite on that other Issue.
 */
export const dependentIdentifier = (
  currentBlocksCandidate: boolean,
  current: string,
  candidate: string,
): string => (currentBlocksCandidate ? candidate : current);
