'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskActivityLogType } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { ArrowRightLeft, CircleDot, HistoryIcon, Timer, UserRoundCog } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { useProjectStore } from '@/store/project';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 16px 32px;
    padding-inline: 24px;
  `,
  mark: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 24px;
    height: 24px;
    border-radius: 50%;

    color: ${cssVar.colorTextTertiary};

    background: ${cssVar.colorFillQuaternary};
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: flex-start;

    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sentence: css`
    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};

    strong {
      font-weight: 500;
      color: ${cssVar.colorText};
    }
  `,
  taskRef: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  time: css`
    flex: none;
    font-size: 12px;
    line-height: 20px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

const STATUS_KEY = {
  backlog: 'taskDetail.status.backlog',
  canceled: 'taskDetail.status.canceled',
  completed: 'taskDetail.status.completed',
  failed: 'taskDetail.status.failed',
  paused: 'taskDetail.status.paused',
  running: 'taskDetail.status.running',
  scheduled: 'taskDetail.status.scheduled',
} as const;

const statusLabel = (t: (key: never) => string, status: unknown) => {
  const key = STATUS_KEY[status as keyof typeof STATUS_KEY];
  return key ? t(key as never) : String(status ?? '—');
};

const PRIORITY_NAME: Record<number, 'high' | 'low' | 'none' | 'normal' | 'urgent'> = {
  0: 'none',
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
};

const TYPE_ICON: Record<TaskActivityLogType, typeof ArrowRightLeft> = {
  assignee_agent: UserRoundCog,
  assignee_user: UserRoundCog,
  automation: Timer,
  priority: ArrowRightLeft,
  reviewer: UserRoundCog,
  status: CircleDot,
};

type FeedRow = {
  actor?: { avatar?: string | null; name?: string | null; type: 'agent' | 'user' } | null;
  createdAt: string;
  fromTarget?: { name?: string | null } | null;
  id: string;
  payload?: {
    actorKind?: 'agent' | 'system' | 'user';
    from?: unknown;
    fromId?: string | null;
    to?: unknown;
    toId?: string | null;
  } | null;
  target?: { avatar?: string | null; name?: string | null } | null;
  taskIdentifier: string;
  taskTitle: string;
  type: TaskActivityLogType;
};

const RelTime = memo<{ time: string }>(({ time }) => {
  const { text, title } = useActivityTime(time);
  return (
    <span className={styles.time} title={title}>
      {text}
    </span>
  );
});

const RowSentence = ({ row }: { row: FeedRow }) => {
  const { t } = useTranslation('chat');
  const actor = (
    <strong>{row.actor?.name || t('taskDetail.activities.assignment.systemActor')}</strong>
  );
  const value = (label: ReactNode) => <span>{label}</span>;
  const person = (p?: { name?: string | null } | null) =>
    value(p?.name || t('taskDetail.activities.assignment.unnamedParticipant'));

  switch (row.type) {
    case 'status': {
      const from = row.payload?.from;
      const to = row.payload?.to;
      return (
        <Trans
          i18nKey={'taskDetail.activities.status.changed'}
          ns={'chat'}
          components={{
            actor,
            from: value(from ? statusLabel(t as never, from) : '—'),
            to: value(to ? statusLabel(t as never, to) : '—'),
          }}
        />
      );
    }
    case 'priority': {
      const label = (level: unknown) => {
        const name = PRIORITY_NAME[typeof level === 'number' ? level : 0] ?? 'none';
        const key = (
          {
            high: 'taskDetail.priority.high',
            low: 'taskDetail.priority.low',
            none: 'taskDetail.priority.none',
            normal: 'taskDetail.priority.normal',
            urgent: 'taskDetail.priority.urgent',
          } as const
        )[name];
        return value(t(key as never));
      };
      return (
        <Trans
          components={{ actor, from: label(row.payload?.from), to: label(row.payload?.to) }}
          i18nKey={'taskDetail.activities.priority.changed'}
          ns={'chat'}
        />
      );
    }
    case 'assignee_agent':
    case 'assignee_user': {
      const assigned = Boolean(row.payload?.toId);
      const key =
        row.type === 'assignee_agent'
          ? assigned
            ? 'taskDetail.activities.assignment.agentAssigned'
            : 'taskDetail.activities.assignment.agentUnassigned'
          : assigned
            ? 'taskDetail.activities.assignment.memberAssigned'
            : 'taskDetail.activities.assignment.memberUnassigned';
      return <Trans components={{ actor, target: person(row.target) }} i18nKey={key} ns={'chat'} />;
    }
    case 'reviewer': {
      const assigned = Boolean(row.payload?.toId);
      return (
        <Trans
          components={{ actor, target: person(row.target) }}
          ns={'chat'}
          i18nKey={
            assigned
              ? 'taskDetail.activities.assignment.reviewerAssigned'
              : 'taskDetail.activities.assignment.reviewerUnassigned'
          }
        />
      );
    }
    case 'automation': {
      const modeName = (snapshot: unknown) => {
        if (snapshot && typeof snapshot === 'object' && 'mode' in snapshot) {
          const mode = (snapshot as { mode?: string }).mode;
          return mode === 'schedule'
            ? t('taskDetail.activities.automation.mode.schedule', {
                pattern: (snapshot as { schedulePattern?: string }).schedulePattern ?? '',
              })
            : t('taskDetail.activities.automation.mode.heartbeat', {
                seconds: (snapshot as { heartbeatInterval?: number }).heartbeatInterval ?? 0,
              });
        }
        return '—';
      };
      const from = row.payload?.from;
      const to = row.payload?.to;
      return from && to ? (
        <Trans
          components={{ actor, from: value(modeName(from)), to: value(modeName(to)) }}
          i18nKey={'taskDetail.activities.automation.changed'}
          ns={'chat'}
        />
      ) : to ? (
        <Trans
          components={{ actor, value: value(modeName(to)) }}
          i18nKey={'taskDetail.activities.automation.set'}
          ns={'chat'}
        />
      ) : (
        <Trans
          components={{ actor }}
          i18nKey={'taskDetail.activities.automation.off'}
          ns={'chat'}
        />
      );
    }
    default: {
      return null;
    }
  }
};

const ProjectActivityFeed = ({ projectId }: { projectId: string }) => {
  const { t } = useTranslation('project');
  const { data, error, isLoading, mutate } = useClientDataSWR(
    ['project:activityFeed', projectId],
    () => projectService.activityFeed(projectId),
  );

  const rows = (data?.data ?? []) as FeedRow[];

  if (isLoading && !data) return <SkeletonList padding={12} rows={8} />;
  if (error && rows.length === 0)
    return (
      <Center flex={1} padding={24}>
        <AsyncError error={error} variant={'block'} onRetry={() => void mutate()} />
      </Center>
    );
  if (rows.length === 0)
    return (
      <Center flex={1} padding={48}>
        <Empty description={t('activity.empty')} icon={HistoryIcon} />
      </Center>
    );

  return (
    <div className={styles.body}>
      {error ? <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} /> : null}
      {rows.map((row) => {
        const RowIcon = TYPE_ICON[row.type] ?? ArrowRightLeft;
        return (
          <div className={styles.row} key={row.id}>
            <span className={styles.mark}>
              <Icon icon={RowIcon} size={13} />
            </span>
            <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
              <div className={styles.sentence}>
                <RowSentence row={row} />
              </div>
              <Text ellipsis className={styles.taskRef}>
                {row.taskIdentifier} · {row.taskTitle}
              </Text>
            </Flexbox>
            {row.actor ? <Avatar avatar={row.actor.avatar ?? undefined} size={20} /> : null}
            <RelTime time={row.createdAt} />
          </div>
        );
      })}
    </div>
  );
};

const ProjectActivityPage = () => {
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { data, error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(
    projectId,
  );

  if (isLoading && !data) return <RouteLoading />;
  if (error && !data)
    return <AsyncError error={error} variant={'page'} onRetry={() => void mutate()} />;
  if (!data) return null;

  return <ProjectActivityFeed projectId={data.data.project.id} />;
};

export default ProjectActivityPage;
