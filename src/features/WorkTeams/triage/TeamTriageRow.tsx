'use client';

import { Flexbox } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  type DropdownItem,
  DropdownMenu,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ClockIcon, MoreHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { resolveTaskStatus } from '@/components/ExecutionStatus';
import { PriorityIcon } from '@/components/PriorityIcon';
import { formatTaskItemDate } from '@/features/AgentTasks/features/formatTaskItemDate';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { lambdaClient } from '@/libs/trpc/client';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { teamTaskDetailPath } from '../teamTaskDetailPath';
import {
  TEAM_TRIAGE_OVERFLOW_I18N,
  type TeamTriageOverflowItem,
  teamTriageOverflowItems,
} from '../teamTriageOverflow';
import {
  TEAM_TRIAGE_SNOOZE_ENABLED,
  type TeamTriageCreator,
  type TeamTriageTask,
  triageAgeLabel,
} from './teamTriageRowModel';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    flex: none;
  `,
  age: css`
    flex: none;

    min-width: 20px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: end;
  `,
  creator: css`
    display: inline-flex;
    flex: none;
    align-items: center;
  `,
  identifier: css`
    flex: none;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;

    color: inherit;
    text-decoration: none;
  `,
  meta: css`
    flex: none;
    align-items: center;
  `,
  row: css`
    padding-block: 7px;
    padding-inline: 4px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface TeamTriageRowProps {
  /** Resolved creator chip — parent owns the workspace-directory lookup. */
  creator?: TeamTriageCreator;
  destinations: Array<{ label: string; value: string }>;
  /** Reassign targets, already filtered to team members and labeled. */
  memberOptions: Array<{ label: string; value: string }>;
  onAction: (action: 'accept' | 'decline') => void;
  onPickDuplicate: (taskId: string) => void;
  onReassign: (taskId: string, assigneeUserId: string) => void;
  onTransferred: () => void;
  task: TeamTriageTask;
}

/**
 * One untriaged issue. Left edge is the Linear issue anatomy — priority,
 * status, identifier, title — the right edge keeps triage meta (age, creator)
 * and the row actions (Accept / Snooze / Decline / ⋯). Snooze renders disabled
 * on purpose: see TEAM_TRIAGE_SNOOZE_ENABLED for the backend gap it marks.
 */
const TeamTriageRow = memo<TeamTriageRowProps>(
  ({
    creator,
    destinations,
    memberOptions,
    onAction,
    onPickDuplicate,
    onReassign,
    onTransferred,
    task,
  }) => {
    const { t, i18n } = useTranslation('common');
    const overflowItems = teamTriageOverflowItems({
      destinations,
      members: memberOptions,
    });

    const transfer = useCallback(
      async (teamId: string) => {
        if (!teamId || task.domainRevision === undefined) return;
        try {
          await lambdaClient.team.moveTaskToTeam.mutate({
            expectedDomainRevision: task.domainRevision,
            taskId: task.id,
            teamId,
          });
          onTransferred();
          toast.success(t('teams.transferUpdated'));
        } catch (error) {
          toast.error(
            isTrpcErrorCode(error, 'CONFLICT')
              ? t('teams.transferConflict')
              : isTrpcErrorCode(error, 'PRECONDITION_FAILED')
                ? t('teams.transferLinear')
                : t('teams.transferFailed'),
          );
        }
      },
      [onTransferred, t, task.domainRevision, task.id],
    );

    const runOverflow = useCallback(
      (kind: TeamTriageOverflowItem['kind'], value: string) => {
        if (kind === 'duplicate') onPickDuplicate(task.id);
        else if (kind === 'reassign') onReassign(task.id, value);
        else void transfer(value);
      },
      [onPickDuplicate, onReassign, task.id, transfer],
    );

    const overflowMenuItems = useMemo<DropdownItem[]>(
      () =>
        overflowItems.map((item) =>
          item.type === 'leaf'
            ? {
                key: item.kind,
                label: t(TEAM_TRIAGE_OVERFLOW_I18N[item.kind]),
                onClick: () => runOverflow(item.kind, item.value),
              }
            : {
                children: item.options.map((option) => ({
                  key: `${item.kind}-${option.value}`,
                  label: option.label,
                  onClick: () => runOverflow(item.kind, option.value),
                })),
                key: item.kind,
                label: t(TEAM_TRIAGE_OVERFLOW_I18N[item.kind]),
                type: 'submenu',
              },
        ),
      [overflowItems, runOverflow, t],
    );

    const age = triageAgeLabel(task.createdAt);
    const createdDate = formatTaskItemDate(task.createdAt, {
      formatOtherYear: t('time.formatOtherYear'),
      formatThisYear: t('time.formatThisYear'),
      locale: i18n.language,
    });

    return (
      <Flexbox horizontal align="center" className={styles.row} gap={8}>
        <WorkspaceLink className={styles.link} to={teamTaskDetailPath(task)}>
          <PriorityIcon priority={task.priority} size={16} />
          <TaskStatusIcon size={16} status={resolveTaskStatus(task.status)} />
          {task.identifier ? <Text className={styles.identifier}>{task.identifier}</Text> : null}
          <Text ellipsis style={{ minWidth: 0 }} weight={500}>
            {task.name ?? task.instruction}
          </Text>
        </WorkspaceLink>
        <Flexbox horizontal align="center" className={styles.meta} gap={12}>
          {age ? (
            <Text className={styles.age} title={createdDate || undefined}>
              {age}
            </Text>
          ) : null}
          {creator ? (
            <span className={styles.creator} title={creator.name}>
              <Avatar avatar={creator.avatar} name={creator.name} size={20} />
            </span>
          ) : null}
        </Flexbox>
        <Flexbox horizontal align="center" className={styles.actions} gap={4}>
          <Button size="small" onClick={() => onAction('accept')}>
            {t('teams.accept')}
          </Button>
          <Button
            disabled={!TEAM_TRIAGE_SNOOZE_ENABLED}
            icon={ClockIcon}
            size="small"
            title={TEAM_TRIAGE_SNOOZE_ENABLED ? undefined : t('teams.snoozeUnavailable')}
          >
            {t('teams.snooze')}
          </Button>
          <Button size="small" onClick={() => onAction('decline')}>
            {t('teams.decline')}
          </Button>
          {overflowMenuItems.length > 0 ? (
            <DropdownMenu items={overflowMenuItems} placement="bottomRight">
              <ActionIcon icon={MoreHorizontalIcon} size="small" title={t('teams.moreActions')} />
            </DropdownMenu>
          ) : null}
        </Flexbox>
      </Flexbox>
    );
  },
);

TeamTriageRow.displayName = 'TeamTriageRow';

export default TeamTriageRow;
