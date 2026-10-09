'use client';
import type { ProjectHealth, ProjectStatus } from '@orvilo/types';
import { PROJECT_HEALTH_STATES, PROJECT_STATUSES } from '@orvilo/types';
import type { ParseKeys } from 'i18next';
import {
  ALargeSmallIcon,
  CalendarDaysIcon,
  CircleUserIcon,
  DiamondIcon,
  HeartPulseIcon,
  LayoutTemplateIcon,
  LinkIcon,
  SignalHighIcon,
  TagIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { STATUS_PROPERTY_ICON } from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import FilterMenuPopover from '@/features/Projects/FilterMenu/FilterMenuPopover';
import type {
  FilterMemberRow,
  FilterMenuGroup,
  FilterMenuOption,
  FilterMenuPicker,
} from '@/features/Projects/FilterMenu/model';
import { toggleListValue, toMemberOptions } from '@/features/Projects/FilterMenu/model';
import { ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import type { ProjectListItem } from '@/store/project/store';

import {
  parseAiProjectFilters,
  PROJECT_LIST_DATE_FIELDS,
  PROJECT_LIST_DATE_WINDOWS,
  PROJECT_LIST_FILTER_GROUPS,
  type ProjectListFilter,
  type ProjectListFilterGroupId,
  projectListFilterKey,
  removeProjectListFilter,
  upsertProjectListFilter,
} from './listFilters';

const GROUP_ICONS: Record<ProjectListFilterGroupId, FilterMenuGroup['icon']> = {
  creator: CircleUserIcon,
  dates: CalendarDaysIcon,
  health: HeartPulseIcon,
  labels: TagIcon,
  lead: UserRoundIcon,
  members: UsersRoundIcon,
  // The milestone entity mark is the diamond, not lucide's signpost
  // `MilestoneIcon` — same glyph the MilestoneIcon component paints.
  milestones: DiamondIcon,
  priority: SignalHighIcon,
  projects: PROJECT_ENTITY_ICON,
  relations: LinkIcon,
  status: STATUS_PROPERTY_ICON,
  teams: UsersRoundIcon,
  template: LayoutTemplateIcon,
  text: ALargeSmallIcon,
};

export interface AddFilterPopoverProps {
  currentUserId?: string;
  filters: readonly ProjectListFilter[];
  members?: readonly FilterMemberRow[];
  membersError?: unknown;
  membersLoading?: boolean;
  onChange: (filters: ProjectListFilter[]) => void;
  /** Fires the "Advanced filter" entry — the host opens the saved-view builder. */
  onOpenAdvanced: () => void;
  projects: readonly Pick<ProjectListItem, 'id' | 'name'>[];
}

const PRIORITY_LABEL_KEY: Record<number, ParseKeys<'project'>> = {
  0: 'create.priority.noPriority',
  1: 'create.priority.urgent',
  2: 'create.priority.high',
  3: 'create.priority.normal',
  4: 'create.priority.low',
};

const option = (
  key: string,
  label: string,
  checked: boolean,
  onToggle: () => void,
  extra?: Pick<FilterMenuOption, 'icon' | 'pinned'>,
): FilterMenuOption => ({ checked, key, label, onToggle, ...extra });

/**
 * The Linear projects "Add filter" menu: the shared {@link FilterMenuPopover}
 * fed with the project list filter groups. Each toggle updates the URL filter
 * immediately; groups whose data is not in the `project.list` payload render
 * disabled rather than filtering on nothing.
 */
const AddFilterPopover = memo<AddFilterPopoverProps>(
  ({
    currentUserId,
    filters,
    members,
    membersError,
    membersLoading,
    onChange,
    onOpenAdvanced,
    projects,
  }) => {
    const { t } = useTranslation('project');

    const memberOptions = useMemo(() => toMemberOptions(members), [members]);

    const activeFilterFor = (key: string) =>
      filters.find((filter) => projectListFilterKey(filter) === key);

    const applyFilter = (filter: ProjectListFilter) =>
      onChange(upsertProjectListFilter(filters, filter));

    const memberPicker = (kind: 'creator' | 'lead'): FilterMenuPicker => {
      const applied = activeFilterFor(kind);
      const selected: (string | null)[] = applied && applied.type === kind ? applied.values : [];
      const toggle = (value: string | null) =>
        applyFilter({ type: kind, values: toggleListValue(selected, value) });
      let statusMessage: string | undefined;
      if (membersLoading) statusMessage = t('list.lead.loading');
      else if (membersError) statusMessage = t('list.filter.membersError');
      return {
        emptyMessage: t('list.lead.noMatches'),
        kind: 'options',
        options: [
          option(
            'none',
            kind === 'lead' ? t('properties.noLead') : t('list.filter.noCreator'),
            selected.includes(null),
            () => toggle(null),
            { pinned: true },
          ),
          ...memberOptions.map((member) =>
            option(
              member.userId,
              member.name,
              selected.includes(member.userId),
              () => toggle(member.userId),
              {
                icon: <Avatar avatar={member.avatar} name={member.name} shape="circle" size={18} />,
              },
            ),
          ),
        ],
        searchPlaceholder: t('list.filter.searchMembers'),
        statusMessage,
      };
    };

    const pickerFor = (group: ProjectListFilterGroupId): FilterMenuPicker => {
      switch (group) {
        case 'status': {
          const applied = activeFilterFor('status');
          const selected = applied?.type === 'status' ? applied.values : [];
          return {
            kind: 'options',
            options: PROJECT_STATUSES.map((status) =>
              option(
                status,
                t(`status.${status}`),
                selected.includes(status),
                () =>
                  applyFilter({
                    type: 'status',
                    values: toggleListValue(selected, status) as ProjectStatus[],
                  }),
                { icon: <ProjectStatusIcon size={16} status={status} /> },
              ),
            ),
          };
        }
        case 'priority': {
          const applied = activeFilterFor('priority');
          const selected = applied?.type === 'priority' ? applied.values : [];
          return {
            kind: 'options',
            options: [1, 2, 3, 4, 0].map((priority) =>
              option(
                String(priority),
                t(PRIORITY_LABEL_KEY[priority]),
                selected.includes(priority),
                () =>
                  applyFilter({ type: 'priority', values: toggleListValue(selected, priority) }),
                { icon: <PriorityIcon priority={priority} size={14} /> },
              ),
            ),
          };
        }
        case 'lead':
        case 'creator': {
          return memberPicker(group);
        }
        case 'health': {
          const applied = activeFilterFor('health');
          const selected = applied?.type === 'health' ? applied.values : [];
          const toggle = (value: ProjectHealth | null) =>
            applyFilter({ type: 'health', values: toggleListValue(selected, value) });
          return {
            kind: 'options',
            options: [
              ...PROJECT_HEALTH_STATES.map((health) =>
                option(
                  health,
                  t(`list.health.${health}`),
                  selected.includes(health),
                  () => toggle(health),
                  { icon: <ProjectHealthIcon health={health} size={14} /> },
                ),
              ),
              option(
                'none',
                t('list.health.noUpdates'),
                selected.includes(null),
                () => toggle(null),
                { icon: <ProjectHealthIcon health={null} size={14} /> },
              ),
            ],
          };
        }
        case 'dates': {
          return {
            fields: PROJECT_LIST_DATE_FIELDS.map((field) => {
              const applied = activeFilterFor(`date.${field}`);
              const activeWindow = applied?.type === 'date' ? applied.window : undefined;
              return {
                activeLabel: activeWindow
                  ? `· ${t(`list.filter.window.${activeWindow}`)}`
                  : undefined,
                key: field,
                label: t(`list.filter.dateField.${field}`),
                windows: PROJECT_LIST_DATE_WINDOWS.map((window) => ({
                  checked: activeWindow === window,
                  key: window,
                  label: t(`list.filter.window.${window}`),
                  // Re-clicking the active window removes the filter (the
                  // reference's submenu checkmarks toggle).
                  onSelect: () =>
                    activeWindow === window
                      ? onChange(removeProjectListFilter(filters, `date.${field}`))
                      : applyFilter({ field, type: 'date', window }),
                })),
              };
            }),
            kind: 'dates',
          };
        }
        case 'projects': {
          const applied = activeFilterFor('projects');
          const selected = applied?.type === 'projects' ? applied.ids : [];
          return {
            kind: 'options',
            options: projects.map((project) =>
              option(project.id, project.name, selected.includes(project.id), () =>
                applyFilter({ ids: toggleListValue(selected, project.id), type: 'projects' }),
              ),
            ),
          };
        }
        default: {
          const applied = activeFilterFor('text');
          return {
            applyLabel: t('list.filter.apply'),
            initialValue: applied?.type === 'text' ? applied.query : '',
            kind: 'text',
            onApply: (query) => applyFilter({ query, type: 'text' }),
            placeholder: t('list.filter.textPlaceholder'),
          };
        }
      }
    };

    const groups = PROJECT_LIST_FILTER_GROUPS.map((group): FilterMenuGroup => ({
      getPicker: () => pickerFor(group.id),
      icon: GROUP_ICONS[group.id],
      id: group.id,
      label: t(`list.filter.group.${group.id}`),
      supported: group.supported,
    }));

    return (
      <FilterMenuPopover
        active={filters.length > 0}
        groups={groups}
        labels={{
          add: t('list.filter.add'),
          advanced: t('list.filter.advanced'),
          ai: t('list.filter.ai'),
          aiHint: t('list.filter.aiHint'),
          aiNoMatch: t('list.filter.aiNoMatch'),
          aiPlaceholder: t('list.filter.aiPlaceholder'),
          back: t('list.filter.back'),
          noMenuMatches: t('list.filter.noMenuMatches'),
          searchPlaceholder: t('list.filter.searchPlaceholder'),
          unavailable: t('list.filter.unavailable'),
        }}
        onOpenAdvanced={onOpenAdvanced}
        onSubmitAi={(text) => {
          const parsed = parseAiProjectFilters(text, { currentUserId, members: memberOptions });
          if (parsed.length === 0) return false;
          let next = [...filters];
          for (const filter of parsed) next = upsertProjectListFilter(next, filter);
          onChange(next);
          return true;
        }}
      />
    );
  },
);

AddFilterPopover.displayName = 'AddFilterPopover';

export default AddFilterPopover;
