'use client';

import { Center, Icon } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import type { TaskActivityLogType } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { createStaticStyles } from 'antd-style';
import type { TFunction } from 'i18next';
import {
  Archive,
  ArrowLeftRight,
  BadgeCheck,
  CircleDot,
  CirclePlay,
  CirclePlus,
  CircleX,
  DiamondIcon,
  Timer,
  UserRoundCog,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { getProjectOverviewPath } from '@/features/Projects/Layout/navigation';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { getMilestoneAnchorId } from '@/features/Projects/milestoneRow';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { type ProjectDetail, useProjectStore } from '@/store/project';

import { ProjectUpdateComposer, ProjectUpdateRow, useProjectUpdates } from '../Updates';
import {
  type ActivityFeedItem,
  type ActivityFeedRow,
  deriveProjectEvents,
  feedWindowStart,
  mergeActivityFeed,
  type ProjectFeedEvent,
  type ProjectFeedEventType,
} from './activityFeedItems';
import { activityFeedCursor, activityFeedRows } from './activityFeedPages';
import { ProjectCreationActivity } from './ProjectCreationActivity';

/**
 * Reference geometry (project-activity/SLICE.md, measured on Linear): compact
 * inline rows — a 16px glyph with no circular backing, 12px/450 text, ~17px
 * row height, 12px between glyph and text. Long-form comments render as
 * bordered cards, not inline rows.
 */
const styles = createStaticStyles(({ css, cssVar }) => ({
  avatar: css`
    flex: none;
    margin-block-start: 1px;
  `,
  body: css`
    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 24px 32px;
    padding-inline: max(24px, calc((100% - 800px) / 2));
  `,
  card: css`
    margin-block: 8px;
    padding-block: 2px;
    padding-inline: 12px;
    border: 0.5px solid ${cssVar.colorBorder};
    border-radius: 10px;

    background: ${cssVar.colorBgContainer};
  `,
  empty: css`
    padding-block: 24px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  glyph: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 17px;

    color: ${cssVar.colorTextTertiary};
  `,
  link: css`
    font-weight: 500;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;

    &:hover {
      text-decoration: underline;
    }
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding-block: 3px;
  `,
  sentence: css`
    font-size: 12px;
    font-weight: 450;
    line-height: 17px;
    color: ${cssVar.colorTextSecondary};

    strong {
      font-weight: 500;
      color: ${cssVar.colorText};
    }
  `,
  taskRef: css`
    color: ${cssVar.colorTextTertiary};
    overflow-wrap: anywhere;

    &:hover {
      color: ${cssVar.colorText};
      text-decoration: underline;
    }
  `,
  time: css`
    flex: none;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
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

const TYPE_ICON: Record<TaskActivityLogType, typeof ArrowLeftRight> = {
  assignee_agent: UserRoundCog,
  assignee_user: UserRoundCog,
  automation: Timer,
  priority: ArrowLeftRight,
  reviewer: UserRoundCog,
  status: CircleDot,
};

const EVENT_ICON: Record<ProjectFeedEventType, typeof Archive> = {
  milestone_added: DiamondIcon,
  project_archived: Archive,
  project_completed: BadgeCheck,
  project_started: CirclePlay,
  review_accepted: BadgeCheck,
  review_rejected: CircleX,
  task_created: CirclePlus,
};

const RelTime = memo<{ time: string }>(({ time }) => {
  const { text, title } = useActivityTime(time);
  return (
    <span className={styles.time} title={title}>
      {text}
    </span>
  );
});

const RowSentence = ({ row }: { row: ActivityFeedRow }) => {
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

const ActivityRowItem = memo<{ row: ActivityFeedRow }>(({ row }) => {
  const RowIcon = TYPE_ICON[row.type] ?? ArrowLeftRight;
  return (
    <div className={styles.row}>
      <span className={styles.glyph}>
        <Icon icon={RowIcon} size={16} />
      </span>
      {row.actor ? (
        <Avatar
          avatar={row.actor.avatar ?? undefined}
          className={styles.avatar}
          name={row.actor.name ?? undefined}
          size={16}
        />
      ) : null}
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

const EventSentence = ({ event, projectRef }: { event: ProjectFeedEvent; projectRef: string }) => {
  const actor = event.actorName ? <strong>{event.actorName}</strong> : null;
  switch (event.type) {
    case 'milestone_added': {
      const name = <strong>{event.milestoneName ?? '—'}</strong>;
      const link = event.milestoneId ? (
        <WorkspaceLink
          className={styles.link}
          to={`${getProjectOverviewPath(projectRef)}#${getMilestoneAnchorId(event.milestoneId)}`}
        >
          {event.milestoneName ?? '—'}
        </WorkspaceLink>
      ) : (
        name
      );
      return (
        <Trans
          components={{ name: link }}
          i18nKey={'activity.event.milestoneAdded'}
          ns={'project'}
        />
      );
    }
    case 'task_created': {
      const task = event.taskIdentifier ? (
        <WorkspaceLink
          className={styles.link}
          to={taskDetailPath(event.taskIdentifier, undefined, event.taskTitle)}
        >
          {event.taskIdentifier}
          {event.taskTitle ? ` · ${event.taskTitle}` : ''}
        </WorkspaceLink>
      ) : (
        <strong>{event.taskTitle ?? '—'}</strong>
      );
      return actor ? (
        <Trans components={{ actor, task }} i18nKey={'activity.event.taskAdded'} ns={'project'} />
      ) : (
        <Trans components={{ task }} i18nKey={'activity.event.taskAddedUnknown'} ns={'project'} />
      );
    }
    case 'review_accepted':
    case 'review_rejected': {
      const key =
        event.type === 'review_accepted'
          ? actor
            ? 'activity.event.reviewAccepted'
            : 'activity.event.reviewAcceptedUnknown'
          : actor
            ? 'activity.event.reviewRejected'
            : 'activity.event.reviewRejectedUnknown';
      return <Trans components={{ actor: actor ?? <span /> }} i18nKey={key} ns={'project'} />;
    }
    default: {
      // project_started | project_completed | project_archived — plain
      // lifecycle sentences with no actor claim (none is recorded).
      const key = {
        project_archived: 'activity.event.archived',
        project_completed: 'activity.event.completed',
        project_started: 'activity.event.started',
      }[event.type];
      return <Trans i18nKey={key} ns={'project'} />;
    }
  }
};

const EventRowItem = memo<{ event: ProjectFeedEvent; projectRef: string }>(
  ({ event, projectRef }) => {
    const EventIcon = EVENT_ICON[event.type];
    return (
      <div className={styles.row}>
        <span className={styles.glyph}>
          {event.type === 'milestone_added' ? (
            <MilestoneIcon size={16} />
          ) : (
            <Icon icon={EventIcon} size={16} />
          )}
        </span>
        {event.actorName || event.actorAvatar ? (
          <Avatar
            avatar={event.actorAvatar}
            className={styles.avatar}
            name={event.actorName}
            size={16}
          />
        ) : null}
        <div className={styles.sentence}>
          <EventSentence event={event} projectRef={projectRef} />
          {' · '}
          <RelTime time={event.createdAt} />
        </div>
      </div>
    );
  },
);

EventRowItem.displayName = 'EventRowItem';

const FeedItem = ({ item, projectRef }: { item: ActivityFeedItem; projectRef: string }) => {
  if (item.kind === 'update')
    return (
      <div className={styles.card}>
        <ProjectUpdateRow update={item.update} />
      </div>
    );
  if (item.kind === 'event') return <EventRowItem event={item.event} projectRef={projectRef} />;
  return <ActivityRowItem row={item.row} />;
};

const ProjectActivityFeed = ({ detail }: { detail: ProjectDetail }) => {
  const project = detail.project;
  const projectId = project.id;
  // Routes address the project by slug when it has one — the same reference
  // the tabs and side panel build links with.
  const projectRef = project.slug ?? projectId;
  const { state } = useLocation();
  const defaultMode = isRecord(state) && state.projectUpdate === true ? 'update' : 'comment';
  const { t } = useTranslation('project');
  const { data, error, isLoading, mutate } = useClientDataSWR(
    ['project:activityFeed', projectId],
    () => projectService.activityFeed(projectId),
  );
  const updatesSWR = useProjectUpdates(projectId);

  // Older pages append below the first SWR page; keyset cursor keeps the
  // feed stable while new rows land at the top.
  const [tail, setTail] = useState<ActivityFeedRow[]>([]);
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
      const items = (next.data?.items ?? []) as ActivityFeedRow[];
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

  const rows = activityFeedRows((data?.data.items ?? []) as ActivityFeedRow[], tail);
  // Project-level events derive from the detail payload — a bounded set that
  // joins the stream only inside the window the paginated feed has loaded.
  const events = useMemo(() => deriveProjectEvents(detail), [detail]);
  const merged = useMemo(
    () =>
      mergeActivityFeed({
        events,
        rows,
        updates: updatesSWR.data ?? [],
        windowStart: feedWindowStart(rows, nextCursor),
      }),
    [events, rows, updatesSWR.data, nextCursor],
  );

  if (isLoading && !data) return <SkeletonList padding={12} rows={8} />;
  if (error && rows.length === 0)
    return (
      <Center flex={1} padding={24}>
        <AsyncError error={error} variant={'block'} onRetry={() => void mutate()} />
      </Center>
    );
  const composer = (
    <ProjectUpdateComposer
      defaultExpanded
      defaultMode={defaultMode}
      projectId={projectId}
      onPosted={() => void updatesSWR.mutate()}
    />
  );

  return (
    <div className={styles.body}>
      {composer}
      {error ? <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} /> : null}
      {merged.length === 0 && !updatesSWR.isLoading ? (
        <div className={styles.empty}>{t('activity.empty')}</div>
      ) : null}
      {merged.map((item) => (
        <FeedItem
          item={item}
          projectRef={projectRef}
          key={
            item.kind === 'activity'
              ? item.row.id
              : item.kind === 'update'
                ? `update-${item.update.id}`
                : `event-${item.event.id}`
          }
        />
      ))}
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
      {!nextCursor && <ProjectCreationActivity project={project} />}
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

  return <ProjectActivityFeed detail={data.data} key={data.data.project.id} />;
};

export default ProjectActivityPage;
