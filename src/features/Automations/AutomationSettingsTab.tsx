import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ChevronRightIcon, TimerIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { taskDetailSelectors } from '@/store/task/selectors';

import { useTaskDetailSelector } from '../AgentTasks/AgentTaskDetail/TaskDetailScope';
import TaskInstruction from '../AgentTasks/AgentTaskDetail/TaskInstruction';
import TaskScheduleConfig from '../AgentTasks/AgentTaskDetail/TaskScheduleConfig';
import { automationDetailNextRun, automationDetailTriggerSummary } from './shared';

dayjs.extend(relativeTime);

const styles = createStaticStyles(({ css, cssVar }) => ({
  sectionTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  triggerCard: css`
    cursor: pointer;
    width: 100%;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

const Section = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div className="flex flex-col gap-2">
    <span className={styles.sectionTitle}>{title}</span>
    {children}
  </div>
);

const TriggerCard = memo(() => {
  const { t } = useTranslation('automation');
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  if (!detail) return null;

  const summary = automationDetailTriggerSummary(detail, t);
  const nextRun = automationDetailNextRun(detail);

  return (
    <TaskScheduleConfig>
      <div
        className={cx(styles.triggerCard, 'flex items-center gap-3 p-3 border')}
        style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
      >
        <TimerIcon color={cssVar.colorTextTertiary} size={18} />
        <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
          <div className="truncate min-w-0 text-[13px] font-medium">
            {summary || t('trigger.unconfigured')}
          </div>
          {nextRun ? (
            <div className="text-[12px] text-muted-foreground">
              {t('trigger.next_run', { time: dayjs(nextRun.toDate()).fromNow() })}
            </div>
          ) : null}
        </div>
        <ChevronRightIcon color={cssVar.colorTextTertiary} size={14} />
      </div>
    </TaskScheduleConfig>
  );
});

const AutomationSettingsTab = memo(() => {
  const { t } = useTranslation('automation');
  return (
    <div className="flex flex-col gap-6 py-4" style={{ maxWidth: 768 }}>
      <Section title={t('trigger.section')}>
        <TriggerCard />
      </Section>
      <Section title={t('instructions.section')}>
        <TaskInstruction />
      </Section>
    </div>
  );
});

export default AutomationSettingsTab;
