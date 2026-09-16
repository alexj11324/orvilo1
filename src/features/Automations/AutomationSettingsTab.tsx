import { Block, Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ChevronRightIcon, TimerIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskInstruction from '../AgentTasks/AgentTaskDetail/TaskInstruction';
import TaskScheduleConfig from '../AgentTasks/AgentTaskDetail/TaskScheduleConfig';
import AssigneeAgentSelector from '../AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '../AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '../AgentTasks/shared/useAgentDisplayMeta';
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
  <Flexbox gap={8}>
    <span className={styles.sectionTitle}>{title}</span>
    {children}
  </Flexbox>
);

const AgentChip = memo(() => {
  const { t } = useTranslation('automation');
  const agentId = useTaskStore(taskDetailSelectors.activeTaskAgentId);
  const taskIdentifier = useTaskStore(taskDetailSelectors.activeTaskId);
  const visibility = useTaskStore(taskDetailSelectors.activeTaskVisibility);
  const meta = useAgentDisplayMeta(agentId ?? undefined);

  return (
    <AssigneeAgentSelector
      currentAgentId={agentId}
      taskIdentifier={taskIdentifier ?? undefined}
      taskVisibility={visibility}
    >
      <Flexbox
        horizontal
        align={'center'}
        gap={8}
        style={{
          border: `1px solid ${cssVar.colorBorderSecondary}`,
          borderRadius: 8,
          cursor: 'pointer',
          paddingBlock: 6,
          paddingInline: 10,
          width: 'fit-content',
        }}
      >
        <AssigneeAvatar agentId={agentId ?? undefined} size={20} />
        <Text fontSize={13}>
          {agentId && meta ? agentDisplayName(meta) : t('instructions.unassigned')}
        </Text>
        <Icon color={cssVar.colorTextTertiary} icon={ChevronRightIcon} size={14} />
      </Flexbox>
    </AssigneeAgentSelector>
  );
});

const TriggerCard = memo(() => {
  const { t } = useTranslation('automation');
  const detail = useTaskStore(taskDetailSelectors.activeTaskDetail);
  if (!detail) return null;

  const summary = automationDetailTriggerSummary(detail, t);
  const nextRun = automationDetailNextRun(detail);

  return (
    <TaskScheduleConfig>
      <Block
        horizontal
        align={'center'}
        className={styles.triggerCard}
        gap={12}
        padding={12}
        variant={'outlined'}
      >
        <Icon color={cssVar.colorTextTertiary} icon={TimerIcon} size={18} />
        <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
          <Text ellipsis fontSize={13} weight={500}>
            {summary || t('trigger.unconfigured')}
          </Text>
          {nextRun ? (
            <Text fontSize={12} type={'secondary'}>
              {t('trigger.next_run', { time: dayjs(nextRun.toDate()).fromNow() })}
            </Text>
          ) : null}
        </Flexbox>
        <Icon color={cssVar.colorTextTertiary} icon={ChevronRightIcon} size={14} />
      </Block>
    </TaskScheduleConfig>
  );
});

const AutomationSettingsTab = memo(() => {
  const { t } = useTranslation('automation');
  return (
    <Flexbox gap={24} paddingBlock={16} style={{ maxWidth: 768 }}>
      <Section title={t('trigger.section')}>
        <TriggerCard />
      </Section>
      <Section title={t('instructions.section')}>
        <AgentChip />
        <TaskInstruction />
      </Section>
    </Flexbox>
  );
});

export default AutomationSettingsTab;
