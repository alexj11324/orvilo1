'use client';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ClockIcon, MoreHorizontalIcon } from 'lucide-react';
import { createElement, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { PriorityIcon } from '@/components/PriorityIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTaskItemDate } from '@/features/AgentTasks/features/formatTaskItemDate';
import { useTaskWorkflowGlyph } from '@/features/AgentTasks/shared/TaskWorkflowBadge';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
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
    const workflowGlyph = useTaskWorkflowGlyph({
      executionStatus: task.status ?? '',
      workflowCategory: task.workflowCategory,
      workflowStateId: task.workflowStateId,
    });
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

    const overflowMenuItems = useMemo<Exclude<SidebarDropdownMenuProps['items'], () => unknown>>(
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
      <div className={cn('flex flex-row items-center gap-2', styles.row)}>
        <WorkspaceLink className={styles.link} to={teamTaskDetailPath(task)}>
          <PriorityIcon priority={task.priority} size={16} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex">
                    {createElement(workflowGlyph.icon, {
                      'aria-hidden': true,
                      'className': 'size-4 shrink-0',
                      'color': workflowGlyph.color,
                    })}
                  </span>
                }
              />
              <TooltipContent>{workflowGlyph.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {task.identifier ? (
            <span className={cn('text-sm', styles.identifier)}>{task.identifier}</span>
          ) : null}
          <span className={cn('min-w-0', 'text-sm truncate font-medium')}>
            {task.name ?? task.instruction}
          </span>
        </WorkspaceLink>
        <div className={cn('flex flex-row items-center gap-3', styles.meta)}>
          {age ? (
            <span className={cn('text-sm', styles.age)} title={createdDate || undefined}>
              {age}
            </span>
          ) : null}
          {creator ? (
            <span className={styles.creator} title={creator.name}>
              <Avatar avatar={creator.avatar} name={creator.name} size={20} />
            </span>
          ) : null}
        </div>
        <div className={cn('flex flex-row items-center gap-1', styles.actions)}>
          <Button variant="outline" onClick={() => onAction('accept')}>
            {t('teams.accept')}
          </Button>
          <Button
            disabled={!TEAM_TRIAGE_SNOOZE_ENABLED}
            title={TEAM_TRIAGE_SNOOZE_ENABLED ? undefined : t('teams.snoozeUnavailable')}
            variant="outline"
          >
            <ClockIcon aria-hidden className="size-4" />
            {t('teams.snooze')}
          </Button>
          <Button variant="outline" onClick={() => onAction('decline')}>
            {t('teams.decline')}
          </Button>
          {overflowMenuItems.length > 0 ? (
            <SidebarDropdownMenu items={overflowMenuItems} placement="bottomRight">
              <Button
                aria-label={t('teams.moreActions')}
                size="icon"
                title={t('teams.moreActions')}
                variant="ghost"
              >
                <MoreHorizontalIcon aria-hidden className="size-4" />
              </Button>
            </SidebarDropdownMenu>
          ) : null}
        </div>
      </div>
    );
  },
);

TeamTriageRow.displayName = 'TeamTriageRow';

export default TeamTriageRow;
