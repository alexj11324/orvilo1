import type { AutomationResultWebhookConfig } from '@orvilo/types';
import { cn } from 'cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ChevronRightIcon, TimerIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { useTaskDetailSelector } from '../AgentTasks/AgentTaskDetail/TaskDetailScope';
import TaskInstruction from '../AgentTasks/AgentTaskDetail/TaskInstruction';
import TaskScheduleConfig from '../AgentTasks/AgentTaskDetail/TaskScheduleConfig';
import McpEventTriggerSettings from './McpEventTriggerSettings';
import ResultWebhookSettings from './ResultWebhookSettings';
import { automationDetailNextRun, automationDetailTriggerSummary } from './shared';
import { useCanManageAutomation } from './useCanManageAutomation';

dayjs.extend(relativeTime);

const styles = {
  sectionTitle: 'text-[13px] font-semibold text-foreground',
  triggerCard: 'w-full cursor-pointer hover:bg-accent',
};

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
        className={cn(styles.triggerCard, 'flex items-center gap-3 p-3 border')}
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--card)' }}
      >
        <TimerIcon color={'var(--ant-color-text-tertiary)'} size={18} />
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
        <ChevronRightIcon color={'var(--ant-color-text-tertiary)'} size={14} />
      </div>
    </TaskScheduleConfig>
  );
});

const AutomationSettingsTab = memo(() => {
  const { t } = useTranslation('automation');
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const refresh = useTaskStore((s) => s.internal_refreshTaskDetail);
  const canManage = useCanManageAutomation(detail?.createdByUserId);
  const taskId = detail?.id;
  const outputs =
    (detail?.config as { resultWebhooks?: AutomationResultWebhookConfig[] } | undefined)
      ?.resultWebhooks ?? [];
  return (
    <div className="flex flex-col gap-6 py-4" style={{ maxWidth: 768 }}>
      {detail?.automationMode === 'event' ? (
        <McpEventTriggerSettings />
      ) : (
        <Section title={t('trigger.section')}>
          <TriggerCard />
        </Section>
      )}
      {taskId ? (
        <ResultWebhookSettings
          key={taskId}
          readOnly={!canManage}
          taskId={taskId}
          value={outputs}
          onSaved={() => refresh(taskId)}
        />
      ) : null}
      <Section title={t('instructions.section')}>
        <TaskInstruction />
      </Section>
    </div>
  );
});

export default AutomationSettingsTab;
