'use client';


import { cssVar } from 'antd-style';
import { memo, useMemo, useState } from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { type UIChatMessage } from '@/types/index';
import { ThreadStatus } from '@/types/index';

import { TaskContent } from '../shared';
import { type TaskMetrics } from './TaskTitle';
import TaskTitle from './TaskTitle';

interface ServerTaskItemProps {
  item: UIChatMessage;
}

const ServerTaskItem = memo<ServerTaskItemProps>(({ item }) => {
  const { id, metadata, taskDetail, tasks } = item;
  const [expanded, setExpanded] = useState(false);

  const title = taskDetail?.title || metadata?.taskTitle;
  const status = taskDetail?.status;
  const threadId = taskDetail?.threadId;

  const isCompleted = status === ThreadStatus.Completed;
  const isError = status === ThreadStatus.Failed || status === ThreadStatus.Cancel;

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
    <Accordion keepMounted multiple value={expanded ? [id] : []} onValueChange={(value) => setExpanded(value.includes(id))}><AccordionItem value={id}><AccordionTrigger className="hover:no-underline" style={{ paddingBlock: 4, paddingInline: 4 }}><TaskTitle metrics={metrics} status={status} title={title} /></AccordionTrigger><AccordionContent>{(
            <div className="flex flex-col gap-4 p-3" style={{border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG,  marginBlock: 8 }}>
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
          )}</AccordionContent></AccordionItem></Accordion>
  );
}, Object.is);

ServerTaskItem.displayName = 'ServerTaskItem';

export default ServerTaskItem;
