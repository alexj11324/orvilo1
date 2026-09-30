'use client';

import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { EXECUTION_STATUS_VISUALS, type ExecutionStatusVisual } from '@/components/ExecutionStatus';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import type { TaskGroupItem } from '@/store/task/slices/list/initialState';

import TaskItem from './TaskItem';

const STATUS_META: Record<string, ExecutionStatusVisual & { titleKey: string }> = {
  backlog: { ...EXECUTION_STATUS_VISUALS.backlog, titleKey: 'taskList.kanban.backlog' },
  needsInput: {
    ...EXECUTION_STATUS_VISUALS.waitingForHuman,
    titleKey: 'taskList.kanban.needsInput',
  },
  running: { ...EXECUTION_STATUS_VISUALS.running, titleKey: 'taskList.kanban.running' },
};

interface StatusGroupProps {
  group: TaskGroupItem;
}

const StatusGroup = memo<StatusGroupProps>(({ group }) => {
  const { t } = useTranslation('chat');
  const { taskId } = useActiveRouteParams<{ taskId?: string }>();
  const meta = STATUS_META[group.key];
  if (!meta) return null;

  return (
    <AccordionItem value={group.key}>
      <AccordionHeader>
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: 4 }}>
          <div className="flex items-center gap-2 h-[24px]" style={{ overflow: 'hidden' }}>
            <div className="flex items-center justify-center flex-none h-[24px] w-[24px]">
              <meta.icon color={meta.color} size={{ size: 14, strokeWidth: 1.75 }} />
            </div>
            <Text ellipsis fontSize={13} style={{ color: cssVar.colorTextSecondary, flex: 1 }}>
              {t(meta.titleKey as 'taskList.kanban.backlog')}
            </Text>
            <Text fontSize={11} type="secondary">
              {group.tasks.length}
            </Text>
          </div>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel contentStyle={{ padding: 0 }}>
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {group.tasks.map((task) => (
            <TaskItem
              active={taskId === task.identifier || taskId === task.id}
              key={task.id}
              task={task}
            />
          ))}
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default StatusGroup;
