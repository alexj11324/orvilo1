import type { ReactNode } from 'react';

import type { StatusVisual } from '@/components/ExecutionStatus';

/** One checkable value row inside a group picker. */
export interface FilterMenuOption {
  checked: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  onToggle: () => void;
  /** Pinned rows (e.g. "No assignee") survive the picker's search keyword. */
  pinned?: boolean;
}

export interface FilterMenuWindow {
  checked: boolean;
  key: string;
  label: string;
  onSelect: () => void;
}

export interface FilterMenuDateField {
  /** Label of the applied window, shown next to the field name. */
  activeLabel?: string;
  key: string;
  label: string;
  windows: readonly FilterMenuWindow[];
}

export type FilterMenuPicker =
  | {
      kind: 'dates';
      fields: readonly FilterMenuDateField[];
    }
  | {
      /** Shown instead of the unpinned options while loading / failed. */
      statusMessage?: string;
      emptyMessage?: string;
      kind: 'options';
      options: readonly FilterMenuOption[];
      /** Placeholder of the visible search box; absent → the box stays screen-reader only. */
      searchPlaceholder?: string;
    }
  | {
      applyLabel: string;
      initialValue: string;
      kind: 'text';
      onApply: (query: string) => void;
      placeholder: string;
    };

export interface FilterMenuGroup {
  /** Lazily builds the value picker; only called while the group is open. */
  getPicker: () => FilterMenuPicker;
  icon: StatusVisual['icon'];
  id: string;
  label: string;
  supported: boolean;
}

export type FilterMenuEntry =
  | { icon: StatusVisual['icon']; key: 'advanced' | 'ai'; label: string }
  | { group: FilterMenuGroup; key: string };

export const normalizeKeyword = (keyword: string) => keyword.trim().toLocaleLowerCase();

export const matchesKeyword = (label: string, keyword: string) =>
  !keyword || label.toLocaleLowerCase().includes(keyword);

/** Drops options that miss the keyword; pinned rows always stay. */
export const filterOptions = <T extends Pick<FilterMenuOption, 'label' | 'pinned'>>(
  options: readonly T[],
  rawKeyword: string,
): T[] => {
  const keyword = normalizeKeyword(rawKeyword);
  return options.filter((option) => option.pinned || matchesKeyword(option.label, keyword));
};

interface MenuEntryInput {
  groups: readonly FilterMenuGroup[];
  keyword: string;
  topEntries: readonly Extract<FilterMenuEntry, { key: 'advanced' | 'ai' }>[];
}

/** The searchable property directory: AI / Advanced first, then matching groups. */
export const buildMenuEntries = ({ groups, keyword, topEntries }: MenuEntryInput) => {
  const normalized = normalizeKeyword(keyword);
  const entries: FilterMenuEntry[] = [
    ...topEntries.filter((entry) => matchesKeyword(entry.label, normalized)),
    ...groups
      .filter((group) => matchesKeyword(group.label, normalized))
      .map((group) => ({ group, key: group.id })),
  ];
  return entries;
};

/** Adds the value when absent, removes it when present. */
export const toggleListValue = <T>(current: readonly T[], value: T): T[] =>
  current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

export interface FilterMemberRow {
  deletedAt?: Date | null | string;
  suspendedAt?: Date | null | string;
  user?: { avatar?: null | string; fullName?: null | string; username?: null | string } | null;
  userId: string;
}

export interface FilterMemberOption {
  avatar?: string;
  name: string;
  userId: string;
}

/** Active, name-sorted member choices for the assignee / creator / lead pickers. */
export const toMemberOptions = (members: readonly FilterMemberRow[] | undefined) =>
  (members ?? [])
    .filter((member) => !member.deletedAt && !member.suspendedAt)
    .map((member): FilterMemberOption => ({
      avatar: member.user?.avatar ?? undefined,
      name: member.user?.fullName || member.user?.username || member.userId,
      userId: member.userId,
    }))
    .sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()));
