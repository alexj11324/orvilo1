'use client';

import { type UIChatMessage } from '@orvilo/types';
import { ThreadStatus } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { memo, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import { TaskContent } from '../../Tasks/shared';
import { type TaskMetrics } from './TaskTitle';
import TaskTitle from './TaskTitle';

interface ServerTaskItemProps {
  item: UIChatMessage;
}

const ServerTaskItem = memo<ServerTaskItemProps>(({ item }) => {
  const { id, agentId, metadata, taskDetail, tasks } = item;
  const [expanded, setExpanded] = useState(false);

  const title = taskDetail?.title || metadata?.taskTitle;
  const status = taskDetail?.status;
  const threadId = taskDetail?.threadId;

  const isCompleted = status === ThreadStatus.Completed;
  const isError = status === ThreadStatus.Failed || status === ThreadStatus.Cancel;

  // Get agent info from store
  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const agent = useAgentGroupStore((s) =>
    activeGroupId && agentId
      ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, agentId)(s)
      : null,
  );

  // Build metrics for TaskTitle (only for completed/error states)
  const metrics: TaskMetrics | undefined = useMemo(() => {
    if (isCompleted || isError) {
      return {
        duration: taskDetail?.duration,
        steps: taskDetail?.totalSteps,
        toolCalls: taskDetail?.totalToolCalls,
      };
    }
    return undefined;
  }, [
    isCompleted,
    isError,
    taskDetail?.duration,
    taskDetail?.totalSteps,
    taskDetail?.totalToolCalls,
  ]);

  return (
    <Accordion
      keepMounted
      multiple
      value={expanded ? [id] : []}
      onValueChange={(value) => setExpanded(value.includes(id))}
    >
      <AccordionItem value={id}>
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: 4 }}>
          {
            <TaskTitle
              metrics={metrics}
              status={status}
              title={title}
              agent={
                agent
                  ? { avatar: agent.avatar || undefined, backgroundColor: agent.backgroundColor }
                  : undefined
              }
            />
          }
        </AccordionTrigger>
        <AccordionContent>
          {
            <div
              className="flex flex-col gap-4 p-3"
              style={{
                border: `1px solid ${cssVar.colorBorder}`,
                borderRadius: cssVar.borderRadiusLG,
                marginBlock: 8,
              }}
            >
              {expanded && (
                <TaskContent
                  id={id}
                  isError={isError}
                  messages={tasks}
                  status={status}
                  taskDetail={taskDetail}
                  threadId={threadId}
                />
              )}
            </div>
          }
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}, isEqual);

ServerTaskItem.displayName = 'ServerTaskItem';

export default ServerTaskItem;
