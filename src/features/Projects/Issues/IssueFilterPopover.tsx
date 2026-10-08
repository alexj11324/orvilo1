'use client';
import type { TaskStatus } from '@orvilo/types';
import { agentDisplayName, TASK_STATUS_VALUES, TASK_TRIAGE_STATUS_VALUES } from '@orvilo/types';
import type { ParseKeys } from 'i18next';
import {
  ALargeSmallIcon,
  BotIcon,
  CalendarDaysIcon,
  CircleUserIcon,
  DiamondIcon,
  InboxIcon,
  LayoutTemplateIcon,
  LinkIcon,
  SignalHighIcon,
  TagIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { STATUS_PROPERTY_ICON } from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import type { SidebarAgentItem } from '@/database/repositories/home';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import FilterMenuPopover from '@/features/Projects/FilterMenu/FilterMenuPopover';
import LabelDot from '@/features/Projects/FilterMenu/LabelDot';
import type {
  FilterMenuGroup,
  FilterMenuOption,
  FilterMenuPicker,
} from '@/features/Projects/FilterMenu/model';
import { toggleListValue, toMemberOptions } from '@/features/Projects/FilterMenu/model';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import type { ProjectIssueFilter, ProjectIssueFilterGroupId } from './issueFilters';
import {
  ISSUE_DATE_FIELDS,
  ISSUE_DATE_WINDOWS,
  parseAiIssueFilters,
  PRIORITY_FILTER_VALUES,
  PROJECT_ISSUE_FILTER_GROUPS,
  projectIssueFilterKey,
  removeProjectIssueFilter,
  upsertProjectIssueFilter,
} from './issueFilters';

const GROUP_ICONS: Record<ProjectIssueFilterGroupId, FilterMenuGroup['icon']> = {
  agent: BotIcon,
  assignee: UserRoundIcon,
  creator: CircleUserIcon,
  dates: CalendarDaysIcon,
  labels: TagIcon,
  links: LinkIcon,
  // The milestone entity mark is the diamond — same glyph MilestoneIcon paints.
  milestone: DiamondIcon,
  priority: SignalHighIcon,
  relations: LinkIcon,
  status: STATUS_PROPERTY_ICON,
  subscribers: UsersRoundIcon,
  template: LayoutTemplateIcon,
  text: ALargeSmallIcon,
  triage: InboxIcon,
};

export interface IssueFilterPopoverProps {
  /** Applied `?filter=` filters — paints the trigger's active state. */
  filters: readonly ProjectIssueFilter[];
  /** Current `?projectMilestoneId=` — the milestone picker's check state. */
  milestoneId?: string;
  /** The project's milestone catalog; absent → the Milestones row hides. */
  milestones?: readonly TaskMilestoneRef[];
  onChange: (filters: ProjectIssueFilter[]) => void;
  onMilestoneChange: (milestoneId: string | undefined) => void;
  /** Fires the "Advanced filter" entry — the host opens the saved-view builder. */
  onOpenAdvanced: () => void;
}

const PRIORITY_LABEL_KEY: Record<number, ParseKeys<'chat'>> = {
  0: 'taskDetail.priority.none',
  1: 'taskDetail.priority.urgent',
  2: 'taskDetail.priority.high',
  3: 'taskDetail.priority.normal',
  4: 'taskDetail.priority.low',
};

const option = (
  key: string,
  label: string,
  checked: boolean,
  onToggle: () => void,
  extra?: Pick<FilterMenuOption, 'icon' | 'pinned'>,
): FilterMenuOption => ({ checked, key, label, onToggle, ...extra });

/** The "No assignee" / "No labels" style row: pinned so search never hides it. */
const noneOption = (selected: readonly unknown[], label: string, onToggle: () => void) =>
  option('none', label, selected.includes(null), onToggle, { pinned: true });

/**
 * The Linear issues "Add filter" menu: the shared {@link FilterMenuPopover}
 * fed with the issue filter groups. Each toggle updates the URL filter
 * immediately; groups the task payload can't answer render disabled.
 *
 * Milestones write the existing `?projectMilestoneId=` param (its header chip
 * stays the readout); `?filter=` carries every other field.
 */
const IssueFilterPopover = memo<IssueFilterPopoverProps>(
  ({ filters, milestoneId, milestones, onChange, onMilestoneChange, onOpenAdvanced }) => {
    const { t } = useTranslation('chat');
    const { t: tCommon } = useTranslation('common');
    const [open, setOpen] = useState(false);

    const workspaceId = useActiveWorkspaceId();
    const isLogin = useUserStore(authSelectors.isLogin);
    const currentUserId = useUserStore(userProfileSelectors.userId);
    // Pickers fetch lazily — the popover owns its rosters so the page header
    // stays cheap when it never opens.
    const membersSWR = useWorkspaceMembersQuery({ enabled: open && !!workspaceId });
    const { data: labelsData } = useClientDataSWR(
      open && isLogin ? taskLabelKeys.list(isLogin, workspaceId) : null,
      () => taskLabelService.getLabels(),
    );
    useFetchAgentList();
    const agents = useHomeStore(homeAgentListSelectors.allAgents);

    const memberOptions = useMemo(() => toMemberOptions(membersSWR.members), [membersSWR.members]);

    const agentOptions = useMemo(
      () =>
        (agents ?? [])
          .map((agent: SidebarAgentItem) => ({ id: agent.id, name: agentDisplayName(agent) }))
          .filter((agent): agent is { id: string; name: string } => Boolean(agent.name))
          .sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())),
      [agents],
    );

    const labelOptions = useMemo(() => labelsData ?? [], [labelsData]);

    const activeFilterFor = (key: string) =>
      filters.find((filter) => projectIssueFilterKey(filter) === key);

    const applyFilter = (filter: ProjectIssueFilter) =>
      onChange(upsertProjectIssueFilter(filters, filter));

    const memberPicker = (kind: 'assignee' | 'creator'): FilterMenuPicker => {
      const applied = activeFilterFor(kind);
      const selected: (string | null)[] = applied && applied.type === kind ? applied.values : [];
      const toggle = (value: string | null) =>
        applyFilter({ type: kind, values: toggleListValue(selected, value) });
      let statusMessage: string | undefined;
      if (membersSWR.isLoading) statusMessage = t('taskList.filter.loading');
      else if (membersSWR.error) statusMessage = t('taskList.filter.membersError');
      return {
        emptyMessage: t('taskList.filter.noMatches'),
        kind: 'options',
        options: [
          noneOption(
            selected,
            kind === 'assignee' ? t('taskList.filter.noAssignee') : t('taskList.filter.noCreator'),
            () => toggle(null),
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
        searchPlaceholder: t('taskList.filter.searchMembers'),
        statusMessage,
      };
    };

    const pickerFor = (group: ProjectIssueFilterGroupId): FilterMenuPicker => {
      switch (group) {
        case 'status': {
          const applied = activeFilterFor('status');
          const selected = applied?.type === 'status' ? applied.values : [];
          return {
            kind: 'options',
            options: TASK_STATUS_VALUES.map((status) =>
              option(
                status,
                t(`taskDetail.status.${status}`),
                selected.includes(status),
                () =>
                  applyFilter({
                    type: 'status',
                    values: toggleListValue(selected, status) as TaskStatus[],
                  }),
                { icon: <TaskStatusIcon size={14} status={status} /> },
              ),
            ),
          };
        }
        case 'priority': {
          const applied = activeFilterFor('priority');
          const selected = applied?.type === 'priority' ? applied.values : [];
          return {
            kind: 'options',
            options: PRIORITY_FILTER_VALUES.map((priority) =>
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
        case 'assignee':
        case 'creator': {
          return memberPicker(group);
        }
        case 'agent': {
          const applied = activeFilterFor('agent');
          const selected = applied?.type === 'agent' ? applied.values : [];
          const toggle = (value: string | null) =>
            applyFilter({ type: 'agent', values: toggleListValue(selected, value) });
          return {
            kind: 'options',
            options: [
              noneOption(selected, t('taskList.filter.noAgent'), () => toggle(null)),
              ...agentOptions.map((agent) =>
                option(agent.id, agent.name, selected.includes(agent.id), () => toggle(agent.id), {
                  icon: <AssigneeAvatar agentId={agent.id} size={18} />,
                }),
              ),
            ],
          };
        }
        case 'labels': {
          const applied = activeFilterFor('labels');
          const selected = applied?.type === 'labels' ? applied.values : [];
          const toggle = (value: string | null) =>
            applyFilter({ type: 'labels', values: toggleListValue(selected, value) });
          return {
            emptyMessage:
              labelOptions.length === 0 ? t('taskList.filter.noLabelsDefined') : undefined,
            kind: 'options',
            options: [
              noneOption(selected, t('taskList.filter.noLabels'), () => toggle(null)),
              ...labelOptions.map((label) =>
                option(label.id, label.name, selected.includes(label.id), () => toggle(label.id), {
                  icon: <LabelDot color={label.color} />,
                }),
              ),
            ],
          };
        }
        case 'milestone': {
          const ordered = [...(milestones ?? [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );
          return {
            kind: 'options',
            options: [
              option(
                'none',
                t('taskList.filter.anyMilestone'),
                !milestoneId,
                () => onMilestoneChange(undefined),
                { pinned: true },
              ),
              ...ordered.map((milestone) =>
                option(
                  milestone.id,
                  milestone.name,
                  milestoneId === milestone.id,
                  // Re-clicking the active milestone clears it (the
                  // reference's submenu checkmarks toggle).
                  () => onMilestoneChange(milestoneId === milestone.id ? undefined : milestone.id),
                  { icon: <MilestoneIcon size={14} /> },
                ),
              ),
            ],
          };
        }
        case 'dates': {
          return {
            fields: ISSUE_DATE_FIELDS.map((field) => {
              const applied = activeFilterFor(`date.${field}`);
              const activeWindow = applied?.type === 'date' ? applied.window : undefined;
              return {
                activeLabel: activeWindow
                  ? `· ${t(`taskList.filter.windows.${activeWindow}`)}`
                  : undefined,
                key: field,
                label: t(`taskList.filter.dateFields.${field}`),
                windows: ISSUE_DATE_WINDOWS.map((window) => ({
                  checked: activeWindow === window,
                  key: window,
                  label: t(`taskList.filter.windows.${window}`),
                  // Re-clicking the active window removes the filter (the
                  // reference's submenu checkmarks toggle).
                  onSelect: () =>
                    activeWindow === window
                      ? onChange(removeProjectIssueFilter(filters, `date.${field}`))
                      : applyFilter({ field, type: 'date', window }),
                })),
              };
            }),
            kind: 'dates',
          };
        }
        case 'triage': {
          const applied = activeFilterFor('triage');
          const selected = applied?.type === 'triage' ? applied.values : [];
          const toggle = (value: (typeof TASK_TRIAGE_STATUS_VALUES)[number] | null) =>
            applyFilter({ type: 'triage', values: toggleListValue(selected, value) });
          return {
            kind: 'options',
            options: [
              ...TASK_TRIAGE_STATUS_VALUES.map((status) =>
                option(
                  status,
                  tCommon(`savedViews.values.triageStatus.${status}`),
                  selected.includes(status),
                  () => toggle(status),
                ),
              ),
              option('none', t('taskList.filter.notInTriage'), selected.includes(null), () =>
                toggle(null),
              ),
            ],
          };
        }
        default: {
          const applied = activeFilterFor('text');
          return {
            applyLabel: t('taskList.filter.apply'),
            initialValue: applied?.type === 'text' ? applied.query : '',
            kind: 'text',
            onApply: (query) => applyFilter({ query, type: 'text' }),
            placeholder: t('taskList.filter.textPlaceholder'),
          };
        }
      }
    };

    const groups = PROJECT_ISSUE_FILTER_GROUPS
      // No milestone catalog (non-project mount) → the row hides; an empty
      // catalog still shows it so an applied `?projectMilestoneId=` keeps its
      // "Any milestone" escape.
      .filter((group) => group.id !== 'milestone' || milestones !== undefined)
      .map((group): FilterMenuGroup => ({
        getPicker: () => pickerFor(group.id),
        icon: GROUP_ICONS[group.id],
        id: group.id,
        label: t(`taskList.filter.groups.${group.id}`),
        supported: group.supported,
      }));

    return (
      <FilterMenuPopover
        active={filters.length > 0}
        groups={groups}
        labels={{
          add: t('taskList.filter.add'),
          advanced: t('taskList.filter.advanced'),
          ai: t('taskList.filter.ai'),
          aiHint: t('taskList.filter.aiHint'),
          aiNoMatch: t('taskList.filter.aiNoMatch'),
          aiPlaceholder: t('taskList.filter.aiPlaceholder'),
          back: t('taskList.filter.back'),
          noMenuMatches: t('taskList.filter.noMenuMatches'),
          searchPlaceholder: t('taskList.filter.searchPlaceholder'),
          unavailable: t('taskList.filter.unavailable'),
        }}
        onOpenAdvanced={onOpenAdvanced}
        onOpenChange={setOpen}
        onSubmitAi={(text) => {
          const parsed = parseAiIssueFilters(text, {
            agents: agentOptions,
            currentUserId,
            labels: labelOptions,
            members: memberOptions,
          });
          if (parsed.length === 0) return false;
          let next = [...filters];
          for (const filter of parsed) next = upsertProjectIssueFilter(next, filter);
          onChange(next);
          return true;
        }}
      />
    );
  },
);

IssueFilterPopover.displayName = 'IssueFilterPopover';

export default IssueFilterPopover;
