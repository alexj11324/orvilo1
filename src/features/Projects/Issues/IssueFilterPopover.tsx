'use client';

import { Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Text, Tooltip } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { agentDisplayName, TASK_STATUS_VALUES, TASK_TRIAGE_STATUS_VALUES } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { ParseKeys } from 'i18next';
import {
  ALargeSmallIcon,
  ArrowLeftIcon,
  BotIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleUserIcon,
  DiamondIcon,
  FilterIcon,
  InboxIcon,
  LayoutTemplateIcon,
  LinkIcon,
  SignalHighIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TagIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { STATUS_PROPERTY_ICON, type StatusVisual } from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import type { SidebarAgentItem } from '@/database/repositories/home';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
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

import type { IssueDateField, ProjectIssueFilter, ProjectIssueFilterGroupId } from './issueFilters';
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

const styles = createStaticStyles(({ css }) => ({
  aiPane: css`
    width: 280px;
    padding: 10px;
  `,
  backButton: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding: 0;
    border: 0;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover,
    &:focus-visible {
      color: ${cssVar.colorText};
    }
  `,
  groupTitle: css`
    padding-block: 2px;
    padding-inline: 8px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  labelDot: css`
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  `,
  menu: css`
    overflow: auto;
    width: 260px;
    max-height: 380px;
    padding: 6px;
  `,
  menuRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 30px;
    padding-inline: 8px;
    border: 0;
    border-radius: 4px;

    font-size: 13px;
    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  menuRowDisabled: css`
    cursor: not-allowed;
    opacity: 0.4;

    &:hover,
    &:focus-visible {
      background: transparent;
    }
  `,
  menuRowLabel: css`
    flex: 1;
    min-width: 0;
  `,
  pickerPane: css`
    overflow: auto;
    width: 260px;
    max-height: 380px;
    padding: 6px;
  `,
  pickerRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 30px;
    padding-inline: 8px;
    border: 0;
    border-radius: 4px;

    font-size: 13px;
    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rowCheck: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;

    color: ${cssVar.colorPrimary};
  `,
  searchWrap: css`
    padding-block-end: 6px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const GROUP_ICONS: Record<ProjectIssueFilterGroupId, StatusVisual['icon']> = {
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

type MemberRow = {
  deletedAt?: Date | null | string;
  suspendedAt?: Date | null | string;
  user?: { avatar?: null | string; fullName?: null | string; username?: null | string } | null;
  userId: string;
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

type PaneView =
  | { kind: 'ai' }
  | { kind: 'dateField'; field: IssueDateField }
  | { kind: 'group'; group: ProjectIssueFilterGroupId }
  | { kind: 'menu' };

const PRIORITY_LABEL_KEY: Record<number, ParseKeys<'chat'>> = {
  0: 'taskDetail.priority.none',
  1: 'taskDetail.priority.urgent',
  2: 'taskDetail.priority.high',
  3: 'taskDetail.priority.normal',
  4: 'taskDetail.priority.low',
};

const memberDisplayName = (member: MemberRow) =>
  member.user?.fullName || member.user?.username || member.userId;

/**
 * The Linear issues "Add filter" menu (ref-2026-09-23 NEW-FINDINGS §6 +
 * my-issues BEHAVIORS §Filter inventory): searchable property directory with
 * `AI filter` / `Advanced filter` on top. Supported groups drill into a value
 * picker that applies live — each toggle updates the URL filter immediately,
 * like the reference's submenu checkmarks. Groups the task payload can't
 * answer render disabled rather than filtering on nothing.
 *
 * Milestones write the existing `?projectMilestoneId=` param (its header chip
 * stays the readout); `?filter=` carries every other field.
 */
const IssueFilterPopover = memo<IssueFilterPopoverProps>(
  ({ filters, milestoneId, milestones, onChange, onMilestoneChange, onOpenAdvanced }) => {
    const { t } = useTranslation('chat');
    const { t: tCommon } = useTranslation('common');
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<PaneView>({ kind: 'menu' });
    const [menuKeyword, setMenuKeyword] = useState('');
    const [aiText, setAiText] = useState('');
    const [aiError, setAiError] = useState(false);
    const [textDraft, setTextDraft] = useState('');
    const [memberKeyword, setMemberKeyword] = useState('');

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

    const memberOptions = useMemo(
      () =>
        (membersSWR.members ?? [])
          .filter((member) => !member.deletedAt && !member.suspendedAt)
          .map((member) => ({
            avatar: member.user?.avatar ?? undefined,
            name: memberDisplayName(member),
            userId: member.userId,
          }))
          .sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())),
      [membersSWR.members],
    );

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

    const submitAi = () => {
      const parsed = parseAiIssueFilters(aiText, {
        agents: agentOptions,
        currentUserId,
        labels: labelOptions,
        members: memberOptions,
      });
      if (parsed.length === 0) {
        setAiError(true);
        return;
      }
      let next = [...filters];
      for (const filter of parsed) next = upsertProjectIssueFilter(next, filter);
      onChange(next);
      setOpen(false);
    };

    const openGroup = (group: ProjectIssueFilterGroupId) => {
      setMemberKeyword('');
      if (group === 'text') {
        const current = activeFilterFor('text');
        setTextDraft(current?.type === 'text' ? current.query : '');
      }
      setView({ kind: 'group', group });
    };

    /* ------------------------------- pickers ------------------------------ */

    const toggleValues = <T,>(
      make: (values: T[]) => ProjectIssueFilter,
      current: readonly T[],
      value: T,
    ) => {
      const nextValues = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      applyFilter(make(nextValues));
    };

    const pickerShell = (title: string, children: ReactNode, onBack?: () => void) => (
      <Flexbox className={styles.pickerPane} gap={2}>
        <button
          className={styles.backButton}
          type="button"
          onClick={onBack ?? (() => setView({ kind: 'menu' }))}
        >
          <Icon icon={ArrowLeftIcon} size={14} />
          {t('taskList.filter.back')}
        </button>
        <span className={styles.groupTitle}>{title}</span>
        {children}
      </Flexbox>
    );

    const checkRow = (
      key: string,
      checked: boolean,
      label: ReactNode,
      onToggle: () => void,
      icon?: ReactNode,
    ) => (
      <button
        aria-pressed={checked}
        className={styles.pickerRow}
        key={key}
        type="button"
        onClick={onToggle}
      >
        <span className={styles.rowCheck}>
          {checked ? <Icon icon={CheckIcon} size={14} /> : null}
        </span>
        {icon}
        <span className={styles.menuRowLabel}>{label}</span>
      </button>
    );

    const memberPicker = (kind: 'assignee' | 'creator') => {
      const applied = activeFilterFor(kind);
      const selected: (string | null)[] = applied && applied.type === kind ? applied.values : [];
      const keyword = memberKeyword.trim().toLocaleLowerCase();
      const visible = memberOptions.filter((member) =>
        keyword ? member.name.toLocaleLowerCase().includes(keyword) : true,
      );
      const noneLabel =
        kind === 'assignee' ? t('taskList.filter.noAssignee') : t('taskList.filter.noCreator');
      return pickerShell(
        t(`taskList.filter.groups.${kind}`),
        <>
          <Input
            autoFocus
            aria-label={t('taskList.filter.searchMembers')}
            placeholder={t('taskList.filter.searchMembers')}
            size="small"
            value={memberKeyword}
            onChange={(event) => setMemberKeyword(event.target.value)}
          />
          {checkRow('none', selected.includes(null), noneLabel, () =>
            toggleValues((values) => ({ type: kind, values }), selected, null),
          )}
          {membersSWR.isLoading ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('taskList.filter.loading')}
            </Text>
          ) : membersSWR.error ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('taskList.filter.membersError')}
            </Text>
          ) : visible.length === 0 ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('taskList.filter.noMatches')}
            </Text>
          ) : (
            visible.map((member) =>
              checkRow(
                member.userId,
                selected.includes(member.userId),
                member.name,
                () => toggleValues((values) => ({ type: kind, values }), selected, member.userId),
                <Avatar avatar={member.avatar} name={member.name} shape="circle" size={18} />,
              ),
            )
          )}
        </>,
      );
    };

    const groupPicker = (group: ProjectIssueFilterGroupId): ReactNode => {
      switch (group) {
        case 'status': {
          const applied = activeFilterFor('status');
          const selected = applied?.type === 'status' ? applied.values : [];
          return pickerShell(
            t('taskList.filter.groups.status'),
            TASK_STATUS_VALUES.map((status) =>
              checkRow(
                status,
                selected.includes(status),
                t(`taskDetail.status.${status}`),
                () =>
                  toggleValues(
                    (values) => ({ type: 'status', values: values as TaskStatus[] }),
                    selected,
                    status,
                  ),
                <TaskStatusIcon size={14} status={status} />,
              ),
            ),
          );
        }
        case 'priority': {
          const applied = activeFilterFor('priority');
          const selected = applied?.type === 'priority' ? applied.values : [];
          return pickerShell(
            t('taskList.filter.groups.priority'),
            PRIORITY_FILTER_VALUES.map((priority) =>
              checkRow(
                String(priority),
                selected.includes(priority),
                t(PRIORITY_LABEL_KEY[priority]),
                () => toggleValues((values) => ({ type: 'priority', values }), selected, priority),
                <PriorityIcon priority={priority} size={14} />,
              ),
            ),
          );
        }
        case 'assignee':
        case 'creator': {
          return memberPicker(group);
        }
        case 'agent': {
          const applied = activeFilterFor('agent');
          const selected = applied?.type === 'agent' ? applied.values : [];
          return pickerShell(
            t('taskList.filter.groups.agent'),
            <>
              {checkRow('none', selected.includes(null), t('taskList.filter.noAgent'), () =>
                toggleValues((values) => ({ type: 'agent', values }), selected, null),
              )}
              {agentOptions.map((agent) =>
                checkRow(
                  agent.id,
                  selected.includes(agent.id),
                  agent.name,
                  () => toggleValues((values) => ({ type: 'agent', values }), selected, agent.id),
                  <AssigneeAvatar agentId={agent.id} size={18} />,
                ),
              )}
            </>,
          );
        }
        case 'labels': {
          const applied = activeFilterFor('labels');
          const selected = applied?.type === 'labels' ? applied.values : [];
          return pickerShell(
            t('taskList.filter.groups.labels'),
            <>
              {checkRow('none', selected.includes(null), t('taskList.filter.noLabels'), () =>
                toggleValues((values) => ({ type: 'labels', values }), selected, null),
              )}
              {labelOptions.length === 0 ? (
                <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
                  {t('taskList.filter.noLabelsDefined')}
                </Text>
              ) : (
                labelOptions.map((label) =>
                  checkRow(
                    label.id,
                    selected.includes(label.id),
                    label.name,
                    () =>
                      toggleValues((values) => ({ type: 'labels', values }), selected, label.id),
                    <span
                      className={styles.labelDot}
                      style={{ background: label.color ?? cssVar.colorFillSecondary }}
                    />,
                  ),
                )
              )}
            </>,
          );
        }
        case 'milestone': {
          const ordered = [...(milestones ?? [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );
          return pickerShell(
            t('taskList.filter.groups.milestone'),
            <>
              {checkRow('none', !milestoneId, t('taskList.filter.anyMilestone'), () =>
                onMilestoneChange(undefined),
              )}
              {ordered.map((milestone) =>
                checkRow(
                  milestone.id,
                  milestoneId === milestone.id,
                  milestone.name,
                  // Re-clicking the active milestone clears it (the
                  // reference's submenu checkmarks toggle).
                  () => onMilestoneChange(milestoneId === milestone.id ? undefined : milestone.id),
                  <MilestoneIcon size={14} />,
                ),
              )}
            </>,
          );
        }
        case 'dates': {
          return pickerShell(
            t('taskList.filter.groups.dates'),
            ISSUE_DATE_FIELDS.map((field) => {
              const applied = activeFilterFor(`date.${field}`);
              return (
                <button
                  className={styles.menuRow}
                  key={field}
                  type="button"
                  onClick={() => setView({ field, kind: 'dateField' })}
                >
                  <span className={styles.menuRowLabel}>
                    {t(`taskList.filter.dateFields.${field}`)}
                    {applied?.type === 'date' ? (
                      <span style={{ color: cssVar.colorTextTertiary, fontSize: 12 }}>
                        {' '}
                        · {t(`taskList.filter.windows.${applied.window}`)}
                      </span>
                    ) : null}
                  </span>
                  <Icon color={cssVar.colorTextQuaternary} icon={ChevronRightIcon} size={14} />
                </button>
              );
            }),
          );
        }
        case 'triage': {
          const applied = activeFilterFor('triage');
          const selected = applied?.type === 'triage' ? applied.values : [];
          return pickerShell(
            t('taskList.filter.groups.triage'),
            <>
              {TASK_TRIAGE_STATUS_VALUES.map((status) =>
                checkRow(
                  status,
                  selected.includes(status),
                  tCommon(`savedViews.values.triageStatus.${status}`),
                  () => toggleValues((values) => ({ type: 'triage', values }), selected, status),
                ),
              )}
              {checkRow('none', selected.includes(null), t('taskList.filter.notInTriage'), () =>
                toggleValues((values) => ({ type: 'triage', values }), selected, null),
              )}
            </>,
          );
        }
        case 'text': {
          return pickerShell(
            t('taskList.filter.groups.text'),
            <Flexbox gap={8}>
              <Input
                autoFocus
                aria-label={t('taskList.filter.textPlaceholder')}
                placeholder={t('taskList.filter.textPlaceholder')}
                size="small"
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyFilter({ query: textDraft, type: 'text' });
                    setOpen(false);
                  }
                }}
              />
              <Flexbox horizontal justify="flex-end">
                <Button
                  disabled={!textDraft.trim()}
                  size="small"
                  type="primary"
                  onClick={() => {
                    applyFilter({ query: textDraft, type: 'text' });
                    setOpen(false);
                  }}
                >
                  {t('taskList.filter.apply')}
                </Button>
              </Flexbox>
            </Flexbox>,
          );
        }
        default: {
          return null;
        }
      }
    };

    /* --------------------------------- pane -------------------------------- */

    const pane = (() => {
      if (view.kind === 'ai') {
        return (
          <Flexbox className={styles.aiPane} gap={8}>
            <button
              className={styles.backButton}
              type="button"
              onClick={() => {
                setView({ kind: 'menu' });
                setAiError(false);
              }}
            >
              <Icon icon={ArrowLeftIcon} size={14} />
              {t('taskList.filter.back')}
            </button>
            <Input
              autoFocus
              aria-label={t('taskList.filter.aiPlaceholder')}
              placeholder={t('taskList.filter.aiPlaceholder')}
              size="small"
              status={aiError ? 'error' : undefined}
              value={aiText}
              onChange={(event) => {
                setAiText(event.target.value);
                setAiError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitAi();
              }}
            />
            <Text fontSize={12} type="secondary">
              {aiError ? t('taskList.filter.aiNoMatch') : t('taskList.filter.aiHint')}
            </Text>
          </Flexbox>
        );
      }
      if (view.kind === 'dateField') {
        const field = view.field;
        const applied = activeFilterFor(`date.${field}`);
        const activeWindow = applied?.type === 'date' ? applied.window : undefined;
        return pickerShell(
          t(`taskList.filter.dateFields.${field}`),
          ISSUE_DATE_WINDOWS.map((window) =>
            checkRow(
              window,
              activeWindow === window,
              t(`taskList.filter.windows.${window}`),
              () => {
                // Re-clicking the active window removes the filter (the
                // reference's submenu checkmarks toggle).
                if (activeWindow === window) {
                  onChange(removeProjectIssueFilter(filters, `date.${field}`));
                } else {
                  applyFilter({ field, type: 'date', window });
                }
                setView({ kind: 'menu' });
              },
            ),
          ),
          () => setView({ group: 'dates', kind: 'group' }),
        );
      }
      if (view.kind === 'group') {
        return groupPicker(view.group);
      }

      // menu
      const keyword = menuKeyword.trim().toLocaleLowerCase();
      const topEntries = [
        { icon: SparklesIcon, key: 'ai', label: t('taskList.filter.ai') },
        { icon: SlidersHorizontalIcon, key: 'advanced', label: t('taskList.filter.advanced') },
      ].filter((entry) => (keyword ? entry.label.toLocaleLowerCase().includes(keyword) : true));
      const groups = PROJECT_ISSUE_FILTER_GROUPS.filter((group) => {
        // No milestone catalog (non-project mount) → the row hides, as the
        // prop contract documents; an empty catalog still shows it so an
        // applied `?projectMilestoneId=` keeps its "Any milestone" escape.
        if (group.id === 'milestone' && milestones === undefined) return false;
        return keyword
          ? t(`taskList.filter.groups.${group.id}`).toLocaleLowerCase().includes(keyword)
          : true;
      });
      return (
        <Flexbox className={styles.menu} gap={2}>
          <div className={styles.searchWrap}>
            <Input
              autoFocus
              aria-label={t('taskList.filter.searchPlaceholder')}
              placeholder={t('taskList.filter.searchPlaceholder')}
              size="small"
              value={menuKeyword}
              onChange={(event) => setMenuKeyword(event.target.value)}
            />
          </div>
          {topEntries.map((entry) => (
            <button
              className={styles.menuRow}
              key={entry.key}
              type="button"
              onClick={() => {
                if (entry.key === 'ai') {
                  setView({ kind: 'ai' });
                } else {
                  setOpen(false);
                  onOpenAdvanced();
                }
              }}
            >
              <Icon color={cssVar.colorTextSecondary} icon={entry.icon} size={14} />
              <span className={styles.menuRowLabel}>{entry.label}</span>
            </button>
          ))}
          {groups.map((group) => {
            const row = (
              <button
                className={cx(styles.menuRow, !group.supported && styles.menuRowDisabled)}
                disabled={!group.supported}
                key={group.id}
                type="button"
                onClick={() => openGroup(group.id)}
              >
                <Icon color={cssVar.colorTextSecondary} icon={GROUP_ICONS[group.id]} size={14} />
                <span className={styles.menuRowLabel}>
                  {t(`taskList.filter.groups.${group.id}`)}
                </span>
                {group.supported ? (
                  <Icon color={cssVar.colorTextQuaternary} icon={ChevronRightIcon} size={14} />
                ) : null}
              </button>
            );
            return group.supported ? (
              row
            ) : (
              <Tooltip key={group.id} title={t('taskList.filter.unavailable')}>
                {/* Tooltip needs a mouse-event-capable child — disabled buttons swallow them. */}
                <span style={{ display: 'flex' }}>{row}</span>
              </Tooltip>
            );
          })}
          {groups.length === 0 && topEntries.length === 0 ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('taskList.filter.noMenuMatches')}
            </Text>
          ) : null}
        </Flexbox>
      );
    })();

    return (
      <Popover
        content={pane}
        open={open}
        placement="bottomRight"
        trigger="click"
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setView({ kind: 'menu' });
            setMenuKeyword('');
            setAiText('');
            setAiError(false);
            setMemberKeyword('');
          }
        }}
      >
        <ActionIcon
          active={filters.length > 0}
          aria-label={t('taskList.filter.add')}
          icon={FilterIcon}
          size="small"
          title={t('taskList.filter.add')}
        />
      </Popover>
    );
  },
);

IssueFilterPopover.displayName = 'IssueFilterPopover';

export default IssueFilterPopover;
