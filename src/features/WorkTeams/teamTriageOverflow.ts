export type TeamTriageOverflowKind = 'duplicate' | 'reassign' | 'transfer';

export interface TeamTriageOverflowOption {
  label: string;
  value: string;
}

export type TeamTriageOverflowItem =
  | {
      kind: TeamTriageOverflowKind;
      label: string;
      type: 'leaf';
      value: string;
    }
  | {
      kind: TeamTriageOverflowKind;
      options: TeamTriageOverflowOption[];
      type: 'submenu';
    };

export const TEAM_TRIAGE_OVERFLOW_I18N = {
  duplicate: 'teams.markDuplicate',
  reassign: 'teams.reassign',
  transfer: 'teams.transfer',
} as const satisfies Record<TeamTriageOverflowKind, string>;

const toItem = (
  kind: TeamTriageOverflowKind,
  options: TeamTriageOverflowOption[],
): TeamTriageOverflowItem | undefined => {
  if (options.length === 0) return undefined;
  if (options.length === 1) {
    return { kind, label: options[0]!.label, type: 'leaf', value: options[0]!.value };
  }
  return { kind, options, type: 'submenu' };
};

/**
 * Accept / Decline stay on the row. Duplicate, transfer, and reassign fold
 * into overflow — and the ⋯ hides when none of them have a valid target.
 */
export const teamTriageOverflowItems = (input: {
  canonicals: TeamTriageOverflowOption[];
  destinations: TeamTriageOverflowOption[];
  members: TeamTriageOverflowOption[];
}): TeamTriageOverflowItem[] =>
  [
    toItem('duplicate', input.canonicals),
    toItem('transfer', input.destinations),
    toItem('reassign', input.members),
  ].filter((item): item is TeamTriageOverflowItem => Boolean(item));
