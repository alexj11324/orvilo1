'use client';

import { Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Text, Tooltip } from '@lobehub/ui/base-ui';
import type { ProjectHealth, ProjectStatus } from '@orvilo/types';
import { PROJECT_HEALTH_STATES, PROJECT_STATUSES } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import {
  ALargeSmallIcon,
  ArrowLeftIcon,
  BoxIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleUserIcon,
  DiamondIcon,
  FilterIcon,
  HeartPulseIcon,
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

import Avatar from '@/components/Avatar';
import { PriorityIcon } from '@/components/PriorityIcon';
import { ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import type { ProjectListItem } from '@/store/project/store';

import {
  parseAiProjectFilters,
  PROJECT_LIST_DATE_FIELDS,
  PROJECT_LIST_DATE_WINDOWS,
  PROJECT_LIST_FILTER_GROUPS,
  type ProjectListDateField,
  type ProjectListFilter,
  type ProjectListFilterGroupId,
  projectListFilterKey,
  removeProjectListFilter,
  upsertProjectListFilter,
} from './listFilters';

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

const GROUP_ICONS: Record<ProjectListFilterGroupId, LucideIcon> = {
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
  projects: BoxIcon,
  relations: LinkIcon,
  status: CircleDotIcon,
  teams: UsersRoundIcon,
  template: LayoutTemplateIcon,
  text: ALargeSmallIcon,
};

type MemberRow = {
  deletedAt?: Date | null | string;
  suspendedAt?: Date | null | string;
  user?: { avatar?: null | string; fullName?: null | string; username?: null | string } | null;
  userId: string;
};

export interface AddFilterPopoverProps {
  currentUserId?: string;
  filters: readonly ProjectListFilter[];
  members?: readonly MemberRow[];
  membersError?: unknown;
  membersLoading?: boolean;
  onChange: (filters: ProjectListFilter[]) => void;
  /** Fires the "Advanced filter" entry — the host opens the saved-view builder. */
  onOpenAdvanced: () => void;
  projects: readonly Pick<ProjectListItem, 'id' | 'name'>[];
}

type PaneView =
  | { kind: 'ai' }
  | { kind: 'dateField'; field: ProjectListDateField }
  | { kind: 'group'; group: ProjectListFilterGroupId }
  | { kind: 'menu' };

const PRIORITY_LABEL_KEY: Record<number, string> = {
  0: 'create.priority.noPriority',
  1: 'create.priority.urgent',
  2: 'create.priority.high',
  3: 'create.priority.normal',
  4: 'create.priority.low',
};

const memberDisplayName = (member: MemberRow) =>
  member.user?.fullName || member.user?.username || member.userId;

/**
 * The Linear projects "Add filter" menu (ref-projects-filter-menu.png):
 * searchable property menu with `AI filter` / `Advanced filter` on top, then
 * the property groups. Supported groups drill into a value picker that
 * applies live (each toggle updates the URL filter immediately, like the
 * reference's submenu checkmarks). Groups whose data is not in the
 * `project.list` payload render disabled rather than filtering on nothing.
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
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<PaneView>({ kind: 'menu' });
    const [menuKeyword, setMenuKeyword] = useState('');
    const [aiText, setAiText] = useState('');
    const [aiError, setAiError] = useState(false);
    const [textDraft, setTextDraft] = useState('');
    const [memberKeyword, setMemberKeyword] = useState('');

    const memberOptions = useMemo(
      () =>
        (members ?? [])
          .filter((member) => !member.deletedAt && !member.suspendedAt)
          .map((member) => ({
            avatar: member.user?.avatar ?? undefined,
            name: memberDisplayName(member),
            userId: member.userId,
          }))
          .sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())),
      [members],
    );

    const activeFilterFor = (key: string) =>
      filters.find((filter) => projectListFilterKey(filter) === key);

    const applyFilter = (filter: ProjectListFilter) =>
      onChange(upsertProjectListFilter(filters, filter));

    const submitAi = () => {
      const parsed = parseAiProjectFilters(aiText, { currentUserId, members: memberOptions });
      if (parsed.length === 0) {
        setAiError(true);
        return;
      }
      let next = [...filters];
      for (const filter of parsed) next = upsertProjectListFilter(next, filter);
      onChange(next);
      setOpen(false);
    };

    const openGroup = (group: ProjectListFilterGroupId) => {
      setMemberKeyword('');
      if (group === 'text') {
        const current = activeFilterFor('text');
        setTextDraft(current?.type === 'text' ? current.query : '');
      }
      setView({ kind: 'group', group });
    };

    /* ------------------------------- pickers ------------------------------ */

    const toggleValues = <T,>(
      make: (values: T[]) => ProjectListFilter,
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
          {t('list.filter.back')}
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

    const memberPicker = (kind: 'creator' | 'lead') => {
      const applied = activeFilterFor(kind);
      const selected: (string | null)[] = applied && applied.type === kind ? applied.values : [];
      const keyword = memberKeyword.trim().toLocaleLowerCase();
      const visible = memberOptions.filter((member) =>
        keyword ? member.name.toLocaleLowerCase().includes(keyword) : true,
      );
      const noneLabel = kind === 'lead' ? t('properties.noLead') : t('list.filter.noCreator');
      return pickerShell(
        t(`list.filter.group.${kind}`),
        <>
          <Input
            autoFocus
            aria-label={t('list.filter.searchMembers')}
            placeholder={t('list.filter.searchMembers')}
            size="small"
            value={memberKeyword}
            onChange={(event) => setMemberKeyword(event.target.value)}
          />
          {checkRow('none', selected.includes(null), noneLabel, () =>
            toggleValues((values) => ({ type: kind, values }), selected, null),
          )}
          {membersLoading ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('list.lead.loading')}
            </Text>
          ) : membersError ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('list.filter.membersError')}
            </Text>
          ) : visible.length === 0 ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('list.lead.noMatches')}
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

    const groupPicker = (group: ProjectListFilterGroupId): ReactNode => {
      switch (group) {
        case 'status': {
          const applied = activeFilterFor('status');
          const selected = applied?.type === 'status' ? applied.values : [];
          return pickerShell(
            t('list.filter.group.status'),
            PROJECT_STATUSES.map((status) =>
              checkRow(
                status,
                selected.includes(status),
                t(`status.${status}`),
                () =>
                  toggleValues(
                    (values) => ({ type: 'status', values: values as ProjectStatus[] }),
                    selected,
                    status,
                  ),
                <ProjectStatusIcon size={14} status={status} />,
              ),
            ),
          );
        }
        case 'priority': {
          const applied = activeFilterFor('priority');
          const selected = applied?.type === 'priority' ? applied.values : [];
          return pickerShell(
            t('list.filter.group.priority'),
            [1, 2, 3, 4, 0].map((priority) =>
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
        case 'lead':
        case 'creator': {
          return memberPicker(group);
        }
        case 'health': {
          const applied = activeFilterFor('health');
          const selected = applied?.type === 'health' ? applied.values : [];
          return pickerShell(
            t('list.filter.group.health'),
            <>
              {PROJECT_HEALTH_STATES.map((health) =>
                checkRow(
                  health,
                  selected.includes(health),
                  t(`list.health.${health}`),
                  () =>
                    toggleValues(
                      (values) => ({ type: 'health', values: values as (ProjectHealth | null)[] }),
                      selected,
                      health,
                    ),
                  <ProjectHealthIcon health={health} size={14} />,
                ),
              )}
              {checkRow(
                'none',
                selected.includes(null),
                t('list.health.noUpdates'),
                () =>
                  toggleValues(
                    (values) => ({ type: 'health', values: values as (ProjectHealth | null)[] }),
                    selected,
                    null,
                  ),
                <ProjectHealthIcon health={null} size={14} />,
              )}
            </>,
          );
        }
        case 'dates': {
          return pickerShell(
            t('list.filter.group.dates'),
            PROJECT_LIST_DATE_FIELDS.map((field) => {
              const applied = activeFilterFor(`date.${field}`);
              return (
                <button
                  className={styles.menuRow}
                  key={field}
                  type="button"
                  onClick={() => setView({ field, kind: 'dateField' })}
                >
                  <span className={styles.menuRowLabel}>
                    {t(`list.filter.dateField.${field}`)}
                    {applied?.type === 'date' ? (
                      <span style={{ color: cssVar.colorTextTertiary, fontSize: 12 }}>
                        {' '}
                        · {t(`list.filter.window.${applied.window}`)}
                      </span>
                    ) : null}
                  </span>
                  <Icon color={cssVar.colorTextQuaternary} icon={ChevronRightIcon} size={14} />
                </button>
              );
            }),
          );
        }
        case 'text': {
          return pickerShell(
            t('list.filter.group.text'),
            <Flexbox gap={8}>
              <Input
                autoFocus
                aria-label={t('list.filter.textPlaceholder')}
                placeholder={t('list.filter.textPlaceholder')}
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
                  {t('list.filter.apply')}
                </Button>
              </Flexbox>
            </Flexbox>,
          );
        }
        case 'projects': {
          const applied = activeFilterFor('projects');
          const selected = applied?.type === 'projects' ? applied.ids : [];
          return pickerShell(
            t('list.filter.group.projects'),
            projects.map((project) =>
              checkRow(project.id, selected.includes(project.id), project.name, () =>
                toggleValues((ids) => ({ ids, type: 'projects' }), selected, project.id),
              ),
            ),
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
              {t('list.filter.back')}
            </button>
            <Input
              autoFocus
              aria-label={t('list.filter.aiPlaceholder')}
              placeholder={t('list.filter.aiPlaceholder')}
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
              {aiError ? t('list.filter.aiNoMatch') : t('list.filter.aiHint')}
            </Text>
          </Flexbox>
        );
      }
      if (view.kind === 'dateField') {
        const field = view.field;
        const applied = activeFilterFor(`date.${field}`);
        const activeWindow = applied?.type === 'date' ? applied.window : undefined;
        return pickerShell(
          t(`list.filter.dateField.${field}`),
          PROJECT_LIST_DATE_WINDOWS.map((window) =>
            checkRow(window, activeWindow === window, t(`list.filter.window.${window}`), () => {
              // Re-clicking the active window removes the filter (the
              // reference's submenu checkmarks toggle).
              if (activeWindow === window) {
                onChange(removeProjectListFilter(filters, `date.${field}`));
              } else {
                applyFilter({ field, type: 'date', window });
              }
              setView({ kind: 'menu' });
            }),
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
        { icon: SparklesIcon, key: 'ai', label: t('list.filter.ai') },
        { icon: SlidersHorizontalIcon, key: 'advanced', label: t('list.filter.advanced') },
      ].filter((entry) => (keyword ? entry.label.toLocaleLowerCase().includes(keyword) : true));
      const groups = PROJECT_LIST_FILTER_GROUPS.filter((group) =>
        keyword ? t(`list.filter.group.${group.id}`).toLocaleLowerCase().includes(keyword) : true,
      );
      return (
        <Flexbox className={styles.menu} gap={2}>
          <div className={styles.searchWrap}>
            <Input
              autoFocus
              aria-label={t('list.filter.searchPlaceholder')}
              placeholder={t('list.filter.searchPlaceholder')}
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
                <span className={styles.menuRowLabel}>{t(`list.filter.group.${group.id}`)}</span>
                {group.supported ? (
                  <Icon color={cssVar.colorTextQuaternary} icon={ChevronRightIcon} size={14} />
                ) : null}
              </button>
            );
            return group.supported ? (
              row
            ) : (
              <Tooltip key={group.id} title={t('list.filter.unavailable')}>
                {/* Tooltip needs a mouse-event-capable child — disabled buttons swallow them. */}
                <span style={{ display: 'flex' }}>{row}</span>
              </Tooltip>
            );
          })}
          {groups.length === 0 && topEntries.length === 0 ? (
            <Text fontSize={12} style={{ padding: '4px 8px' }} type="secondary">
              {t('list.filter.noMenuMatches')}
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
          aria-label={t('list.filter.add')}
          icon={FilterIcon}
          size="small"
          title={t('list.filter.add')}
        />
      </Popover>
    );
  },
);

AddFilterPopover.displayName = 'AddFilterPopover';

export default AddFilterPopover;
