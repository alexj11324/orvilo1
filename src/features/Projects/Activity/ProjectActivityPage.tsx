'use client';

import { Center, Empty, Icon } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import type { ProjectUpdate, TaskActivityLogType } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import type { TFunction } from 'i18next';
import {
  ArrowRightLeft,
  CircleDot,
  HistoryIcon,
  MessageSquareText as MessageSquareTextIcon,
  Timer,
  UserRoundCog,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { useProjectStore } from '@/store/project';

import { ProjectUpdateRow, useProjectUpdates } from '../Updates';
import { activityFeedCursor, activityFeedRows } from './activityFeedPages';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 24px 32px;
    padding-inline: max(24px, calc((100% - 800px) / 2));
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
    gap: 8px;
    align-items: center;
    padding-block: 8px;
  `,
  sentence: css`
    font-size: 14px;
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
    overflow-wrap: anywhere;

    &:hover {
      color: ${cssVar.colorText};
      text-decoration: underline;
    }
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

const statusLabel = (t: TFunction<'chat'>, status: unknown) => {
  const key = STATUS_KEY[status as keyof typeof STATUS_KEY];
  return key ? t(key) : String(status ?? '—');
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

type RowItem = { kind: 'activity'; row: FeedRow } | { kind: 'update'; update: ProjectUpdate };

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
            from: value(from ? statusLabel(t, from) : '—'),
            to: value(to ? statusLabel(t, to) : '—'),
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
        return value(t(key));
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

const ActivityRowItem = memo<{ row: FeedRow }>(({ row }) => {
  const RowIcon = TYPE_ICON[row.type] ?? ArrowRightLeft;
  return (
    <div className={styles.row}>
      <span className={styles.mark}>
        <Icon icon={RowIcon} size={13} />
      </span>
      <div className={styles.sentence}>
        <RowSentence row={row} />{' '}
        <WorkspaceLink
          className={styles.taskRef}
          to={taskDetailPath(row.taskIdentifier, undefined, row.taskTitle)}
        >
          {row.taskIdentifier} · {row.taskTitle}
        </WorkspaceLink>
        {' · '}
        <RelTime time={row.createdAt} />
      </div>
    </div>
  );
});

ActivityRowItem.displayName = 'ActivityRowItem';

const ProjectActivityFeed = ({ projectId }: { projectId: string }) => {
  const { t } = useTranslation('project');
  const { data, error, isLoading, mutate } = useClientDataSWR(
    ['project:activityFeed', projectId],
    () => projectService.activityFeed(projectId),
  );
  const updatesSWR = useProjectUpdates(projectId);

  // Older pages append below the first SWR page; keyset cursor keeps the
  // feed stable while new rows land at the top.
  const [tail, setTail] = useState<FeedRow[]>([]);
  const [tailCursor, setTailCursor] = useState<string | null | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Error | undefined>();
  useEffect(() => {
    setTail([]);
    setTailCursor(undefined);
    setMoreError(undefined);
  }, [projectId]);

  const nextCursor = activityFeedCursor(data?.data.nextCursor, tailCursor);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const next = await projectService.activityFeed(projectId, 50, nextCursor);
      const items = (next.data?.items ?? []) as FeedRow[];
      setTail((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...items.filter((row) => !seen.has(row.id))];
      });
      setTailCursor(next.data?.nextCursor ?? null);
    } catch (loadError) {
      setMoreError(loadError as Error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, projectId]);

  const rows = activityFeedRows((data?.data.items ?? []) as FeedRow[], tail);
  const updates = updatesSWR.data ?? [];
  const merged = useMemo<RowItem[]>(
    () =>
      [
        ...rows.map((row) => ({ kind: 'activity' as const, row })),
        ...updates.map((update) => ({ kind: 'update' as const, update })),
      ].sort((a, b) => {
        const at = a.kind === 'activity' ? a.row.createdAt : a.update.createdAt;
        const bt = b.kind === 'activity' ? b.row.createdAt : b.update.createdAt;
        return bt.localeCompare(at);
      }),
    [rows, updates],
  );

  if (isLoading && !data) return <SkeletonList padding={12} rows={8} />;
  if (error && rows.length === 0)
    return (
      <Center flex={1} padding={24}>
        <AsyncError error={error} variant={'block'} onRetry={() => void mutate()} />
      </Center>
    );
  if (merged.length === 0)
    return (
      <Center flex={1} padding={48}>
        <Empty description={t('activity.empty')} icon={HistoryIcon} />
      </Center>
    );

  return (
    <div className={styles.body}>
      {error ? <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} /> : null}
      {merged.map((item) =>
        item.kind === 'update' ? (
          <div className={styles.row} key={`update-${item.update.id}`}>
            <span className={styles.mark}>
              <Icon icon={MessageSquareTextIcon} size={13} />
            </span>
            <div className={styles.sentence}>
              <ProjectUpdateRow update={item.update} />
            </div>
          </div>
        ) : (
          <ActivityRowItem key={item.row.id} row={item.row} />
        ),
      )}
      {moreError ? (
        <AsyncError error={moreError} variant={'inline'} onRetry={() => void loadMore()} />
      ) : null}
      {nextCursor ? (
        <Center paddingBlock={16}>
          <Button loading={loadingMore} onClick={() => void loadMore()}>
            {t('activity.loadMore', { defaultValue: 'Load more' })}
          </Button>
        </Center>
      ) : null}
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

  return <ProjectActivityFeed key={data.data.project.id} projectId={data.data.project.id} />;
};

export default ProjectActivityPage;
