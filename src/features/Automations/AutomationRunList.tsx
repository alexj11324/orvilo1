import { Empty, Flexbox } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import type { TaskDetailActivity } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { BotMessageSquare, MessageSquareIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskStore } from '@/store/task';
import { taskActivitySelectors } from '@/store/task/selectors';

import RunStatusBadge from './RunStatusBadge';
import { runDuration, runTriggerLabel } from './shared';

dayjs.extend(relativeTime);

const styles = createStaticStyles(({ css, cssVar }) => ({
  headerRow: css`
    display: grid;
    grid-template-columns: minmax(0, 2fr) 90px 130px 120px 70px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
  `,
  row: css`
    cursor: pointer;

    display: grid;
    grid-template-columns: minmax(0, 2fr) 90px 130px 120px 70px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 8px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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
    <div className={styles.row} onClick={open}>
      <Text ellipsis fontSize={13} weight={500}>
        {activity.title || t(`run_source.${runTriggerLabel(activity.trigger)}`)}
      </Text>
      <Text fontSize={12} type={'secondary'}>
        {t(`run_source.${runTriggerLabel(activity.trigger)}`)}
      </Text>
      <Text
        ellipsis
        fontSize={12}
        title={activity.time ? dayjs(activity.time).format('LLL') : undefined}
        type={'secondary'}
      >
        {activity.time ? dayjs(activity.time).fromNow() : '—'}
      </Text>
      <RunStatusBadge status={activity.status} />
      <Text fontSize={12} type={'secondary'}>
        {runDuration(activity.time, activity.completedAt)}
      </Text>
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
  const activities = useTaskStore(taskActivitySelectors.activeTaskActivities);

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
      <Empty
        description={t('run_history.no_matches')}
        icon={BotMessageSquare}
        style={{ marginTop: 16 }}
      />
    );
  }

  return (
    <Flexbox paddingBlock={8}>
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
    </Flexbox>
  );
});

export default AutomationRunList;
