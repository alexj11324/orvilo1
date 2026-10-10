import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useTaskStore } from '@/store/task';
import { oneLineEllipsis } from '@/styles';

import { useLiveRun } from './useLiveRun';

const Title = memo(() => {
  const { t } = useTranslation('chat');
  const taskId = useChatStore(chatPortalSelectors.taskResultId);
  const detail = useTaskStore((state) => (taskId ? state.taskDetailMap[taskId] : undefined));
  const liveRun = useLiveRun();
  const agentMeta = useAgentDisplayMeta(liveRun?.agentId);

  // A live run is a conversation, so it is headed like one: who is working,
  // then what this run is about.
  if (liveRun)
    return (
      <div className="flex flex-row items-center flex-1 gap-2" style={{ minWidth: 0 }}>
        <AssigneeAvatar agentId={liveRun.agentId} size={20} />
        <div className="text-[14px] font-medium" style={{ flexShrink: 0 }}>
          {agentMeta?.title ?? liveRun.activity.author?.name}
        </div>
        <div
          className={cn('text-[13px]', oneLineEllipsis)}
          style={{ color: 'var(--muted-foreground)', flex: 1, minWidth: 0 }}
        >
          {liveRun.activity.title}
        </div>
      </div>
    );

  return (
    <div className="flex flex-row items-center flex-1 gap-2" style={{ minWidth: 0 }}>
      <div className="text-[14px] font-medium">{t('goalDetail.taskResult')}</div>
      {(detail?.identifier || detail?.name) && (
        <div
          className={cn('text-[13px]', oneLineEllipsis)}
          style={{ color: 'var(--muted-foreground)', flex: 1, minWidth: 0 }}
        >
          {[detail.identifier, detail.name].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
});

Title.displayName = 'TaskResultPortalTitle';
export default Title;
