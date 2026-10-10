import type { TaskDetailActivity } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { BotMessageSquare, MessageSquareIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { useTaskStore } from '@/store/task';
import { taskActivitySelectors } from '@/store/task/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useTaskDetailSelector } from '../AgentTasks/AgentTaskDetail/TaskDetailScope';
import RunStatusBadge from './RunStatusBadge';
import { runDuration, runTriggerLabel } from './shared';

dayjs.extend(relativeTime);

const styles = {
  headerRow:
    'grid items-center gap-3 border-b border-sidebar-border px-2 py-1.5 text-[12px] font-medium text-(--ant-color-text-tertiary) grid-cols-[minmax(0,2fr)_90px_130px_120px_70px_40px]',
  row: 'grid cursor-pointer items-center gap-3 rounded-(--radius-card) p-2 hover:bg-accent grid-cols-[minmax(0,2fr)_90px_130px_120px_70px_40px]',
};

const RunRow = memo<{ activity: TaskDetailActivity }>(({ activity }) => {
  const { t } = useTranslation('automation');
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);

  const open = () => {
    if (!activity.id) return;
    openTopicDrawer(activity.id, {
      agentId:
        activity.author?.type === 'agent' ? activity.author.id : activity.agentId || undefined,
      title: activity.title,
    });
  };

  return (
    <div {...clickableProps()} className={cn(styles.row, CLICKABLE_FOCUS_RING)} onClick={open}>
      <div className="truncate min-w-0 text-[13px] font-medium">
        {activity.title || t(`run_source.${runTriggerLabel(activity.trigger)}`)}
      </div>
      <div className="text-[12px] text-muted-foreground">
        {t(`run_source.${runTriggerLabel(activity.trigger)}`)}
      </div>
      <div
        className="truncate min-w-0 text-[12px] text-muted-foreground"
        title={activity.time ? formatAbsoluteDateTime(activity.time) : undefined}
      >
        {activity.time ? dayjs(activity.time).fromNow() : '—'}
      </div>
      <RunStatusBadge status={activity.status} />
      <div className="text-[12px] text-muted-foreground">
        {runDuration(activity.time, activity.completedAt)}
      </div>
      <ActionIcon
        icon={MessageSquareIcon}
        size={'small'}
        title={t('run.open_conversation')}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      />
    </div>
  );
});

/** Run-history table for one automation — the detail page's "Runs" tab. */
const AutomationRunList = memo(() => {
  const { t } = useTranslation('automation');
  const activities = useTaskDetailSelector(taskActivitySelectors.taskActivities);

  const runs = useMemo(
    () =>
      activities
        .filter((activity) => activity.type === 'topic' && activity.id)
        .sort(
          (a, b) =>
            dayjs(b.time ?? b.createdAt ?? 0).valueOf() -
            dayjs(a.time ?? a.createdAt ?? 0).valueOf(),
        ),
    [activities],
  );

  if (runs.length === 0) {
    return (
      <Empty style={{ marginTop: 16 }}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BotMessageSquare />
          </EmptyMedia>
          <EmptyDescription>{t('run_history.no_matches')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col py-2">
      <div className={styles.headerRow}>
        <span>{t('run_history.automation')}</span>
        <span>{t('run_history.trigger')}</span>
        <span>{t('run_history.triggered')}</span>
        <span>{t('run_history.status')}</span>
        <span>{t('run_history.duration')}</span>
        <span />
      </div>
      {runs.map((activity) => (
        <RunRow activity={activity} key={activity.id} />
      ))}
    </div>
  );
});

export default AutomationRunList;
