'use client';

import { Flexbox } from '@lobehub/ui';
import { Avatar, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { UnassignedAssigneeIcon } from '@/features/AgentTasks/features/UnassignedAssigneeIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import type { ProjectDetail } from '@/store/project';

import {
  type IssueBreakdownGroup,
  projectIssueAssigneeBreakdown,
  projectIssueLabelBreakdown,
} from '../projectIssueBurnup';
import { projectIssueProgress } from '../projectIssueProgress';
import { getProjectTasksPath } from './navigation';
import { ProjectBurnupChart } from './ProjectBurnupChart';

const styles = createStaticStyles(({ css }) => ({
  breakdownRow: css`
    cursor: default;

    position: relative;

    display: flex;
    gap: 8px;
    align-items: center;

    height: 30px;
    margin-inline: -10px;
    padding-inline: 10px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:hover > a,
    &:focus-within > a {
      pointer-events: auto;
      opacity: 1;
    }
  `,
  labelDot: css`
    flex: none;

    width: 10px;
    height: 10px;
    margin-inline: 4px;
    border-radius: 2px;
  `,
  metric: css`
    flex: 1;
    margin: 0;
    font-size: 12px;
    line-height: 20px;

    dt {
      display: flex;
      gap: 5px;
      align-items: center;
      color: ${cssVar.colorTextSecondary};
    }

    dd {
      margin: 0;
      padding-inline-start: 11px;
      color: ${cssVar.colorText};
    }
  `,
  marker: css`
    width: 6px;
    height: 6px;
    border-radius: 1px;
  `,
  seeIssues: css`
    pointer-events: none;

    position: absolute;
    inset-inline-end: 10px;

    display: flex;
    align-items: center;

    height: 24px;
    padding-inline: 35px 8px;
    border-radius: 2px;

    font-size: 12px;
    font-weight: 450;
    color: ${cssVar.colorText};

    /* Hover-reveal without leaving the tab order: pointer-events stays off
       until the row is hovered or the link itself is focused, which also
       makes the link keyboard-operable. */
    opacity: 0;
    background:
      linear-gradient(${cssVar.colorFillTertiary}, ${cssVar.colorFillTertiary}),
      ${cssVar.colorBgContainer};
  `,
  toggle: css`
    cursor: pointer;

    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    height: 22px;
    padding: 0;
    padding-inline: 10px;
    border: 0;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 450;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  toggleActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
}));

const colors = {
  scope: cssVar.colorTextTertiary,
  started: cssVar.colorWarning,
  completed: cssVar.colorPrimary,
};

type BreakdownKind = 'assignees' | 'labels';
type AssigneeProfile = NonNullable<ProjectDetail['assignees']>[number];
type TaskLabel = { color?: string | null; id: string; name: string };

export function ProjectIssueProgress({
  assignees,
  issues,
  projectRef,
  taskLabels,
}: {
  assignees?: ProjectDetail['assignees'];
  issues: ProjectDetail['tasks'];
  projectRef: string;
  taskLabels?: Record<string, readonly TaskLabel[]>;
}) {
  const { t } = useTranslation('project');
  const [expanded, setExpanded] = useState<BreakdownKind | null>(null);

  const progress = useMemo(() => projectIssueProgress(issues), [issues]);
  const assigneeGroups = useMemo(() => projectIssueAssigneeBreakdown(issues ?? []), [issues]);
  const labelGroups = useMemo(
    () => projectIssueLabelBreakdown(issues ?? [], taskLabels),
    [issues, taskLabels],
  );
  const assigneeById = useMemo(
    () => new Map((assignees ?? []).map((profile) => [profile.id, profile])),
    [assignees],
  );
  const labelById = useMemo(() => {
    const map = new Map<string, TaskLabel>();
    for (const labels of Object.values(taskLabels ?? {})) {
      for (const label of labels) map.set(label.id, label);
    }
    return map;
  }, [taskLabels]);

  if (!progress) return <span role="status">{t('overview.progressUnavailable')}</span>;

  const seeIssuesTo = (group: IssueBreakdownGroup) =>
    `${getProjectTasksPath(projectRef)}?filter=${encodeURIComponent(
      `${group.filterType}:${group.filterValue ?? 'none'}`,
    )}`;

  const assigneeRow = (group: IssueBreakdownGroup) => {
    const profile: AssigneeProfile | undefined =
      group.filterValue === null ? undefined : assigneeById.get(group.filterValue);
    const kind: 'agent' | 'human' = group.filterType === 'agent' ? 'agent' : 'human';
    return (
      <div className={styles.breakdownRow} key={group.key}>
        {profile ? (
          <Avatar
            avatar={profile.avatar || undefined}
            shape={'circle'}
            size={18}
            title={profile.name}
            variant={'outlined'}
            background={
              (profile.kind === 'agent' ? profile.backgroundColor : null) || cssVar.colorBgContainer
            }
          />
        ) : (
          <UnassignedAssigneeIcon kind={kind} size={18} />
        )}
        <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }} weight={450}>
          {profile?.name ??
            (group.filterValue === null ? t('overview.noAssignee') : t('overview.unknownAssignee'))}
        </Text>
        <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
          {t('overview.milestoneProgressOf', { count: group.scope, percent: group.percent })}
        </Text>
        <WorkspaceLink className={styles.seeIssues} to={seeIssuesTo(group)}>
          {t('overview.milestoneSeeIssues')}
        </WorkspaceLink>
      </div>
    );
  };

  const labelRow = (group: IssueBreakdownGroup) => {
    const label = group.filterValue === null ? undefined : labelById.get(group.filterValue);
    return (
      <div className={styles.breakdownRow} key={group.key}>
        <span
          aria-hidden
          className={styles.labelDot}
          style={{ background: label?.color || cssVar.colorTextTertiary }}
        />
        <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }} weight={450}>
          {label?.name ??
            (group.filterValue === null ? t('overview.noLabel') : t('overview.unknownLabel'))}
        </Text>
        <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
          {t('overview.milestoneProgressOf', { count: group.scope, percent: group.percent })}
        </Text>
        <WorkspaceLink className={styles.seeIssues} to={seeIssuesTo(group)}>
          {t('overview.milestoneSeeIssues')}
        </WorkspaceLink>
      </div>
    );
  };

  return (
    <Flexbox gap={8}>
      <Flexbox horizontal gap={8}>
        {(['scope', 'started', 'completed'] as const).map((key) => (
          <dl className={styles.metric} key={key}>
            <dt>
              <span aria-hidden className={styles.marker} style={{ background: colors[key] }} />
              {t(`overview.progress.${key}`)}
            </dt>
            <dd>{progress[key]}</dd>
          </dl>
        ))}
      </Flexbox>
      <ProjectBurnupChart issues={issues ?? []} />
      <Flexbox horizontal gap={6}>
        {(['assignees', 'labels'] as const).map((kind) => (
          <button
            aria-pressed={expanded === kind}
            className={cx(styles.toggle, expanded === kind && styles.toggleActive)}
            key={kind}
            type="button"
            onClick={() => setExpanded((current) => (current === kind ? null : kind))}
          >
            {t(`overview.progressBreakdown.${kind}`)}
          </button>
        ))}
      </Flexbox>
      {expanded === 'assignees' && assigneeGroups && (
        <Flexbox gap={1}>{assigneeGroups.map(assigneeRow)}</Flexbox>
      )}
      {expanded === 'labels' && labelGroups && (
        <Flexbox gap={1}>{labelGroups.map(labelRow)}</Flexbox>
      )}
    </Flexbox>
  );
}
