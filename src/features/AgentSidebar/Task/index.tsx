'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { ArrowRight } from 'lucide-react';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useClientDataSWR } from '@/libs/swr';
import { taskKeys } from '@/libs/swr/keys';
import { taskService } from '@/services/task';
import { useAgentStore } from '@/store/agent';
import type { TaskGroupItem } from '@/store/task/slices/list/initialState';

import StatusGroup from './StatusGroup';

const SIDEBAR_GROUPS: Array<{ key: string; workflowCategories: TaskWorkflowCategory[] }> = [
  { key: 'in_review', workflowCategories: ['in_review'] },
  { key: 'backlog', workflowCategories: ['backlog'] },
  { key: 'in_progress', workflowCategories: ['in_progress'] },
];
const STATUS_ORDER = SIDEBAR_GROUPS.map((g) => g.key);

interface TaskListProps {
  itemKey: string;
}

const TaskList = memo<TaskListProps>(({ itemKey }) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const agentId = useAgentStore((s) => s.activeAgentId);

  const enabled = !!agentId;
  const { data, isLoading } = useClientDataSWR<{ data: TaskGroupItem[]; success: boolean }>(
    enabled ? taskKeys.sidebarGroups(agentId) : null,
    async ([, id]: [string, string]) =>
      taskService.groupList({ assigneeAgentId: id, groups: SIDEBAR_GROUPS }),
    {
      fallbackData: { data: [], success: true },
      revalidateOnFocus: false,
    },
  );
  const taskGroups = useMemo(() => data?.data ?? [], [data?.data]);

  const orderedGroups = useMemo(() => {
    const map = new Map(taskGroups.map((g) => [g.key, g]));
    return STATUS_ORDER.map((key) => map.get(key)).filter(
      (g): g is NonNullable<typeof g> => !!g && g.tasks.length > 0,
    );
  }, [taskGroups]);

  const totalTasks = useMemo(
    () => orderedGroups.reduce((acc, g) => acc + g.tasks.length, 0),
    [orderedGroups],
  );

  const handleViewAll = useCallback(
    (e: MouseEvent) => {
      // Stop the click from toggling the accordion header.
      e.stopPropagation();
      if (agentId) navigate(`/agent/${agentId}/tasks`);
    },
    [agentId, navigate],
  );

  const titleNode = (
    <div className="flex items-center gap-1">
      <div className="truncate text-[12px] text-muted-foreground font-medium">{t('tab.tasks')}</div>
      {totalTasks > 0 && <div className="text-[11px] text-muted-foreground">{totalTasks}</div>}
    </div>
  );

  const actionNode = (
    <ActionIcon
      icon={ArrowRight}
      size={'small'}
      title={t('taskList.viewAll')}
      onClick={handleViewAll}
    />
  );

  const header = (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
          {titleNode}
        </AccordionTrigger>
      </div>
      <div className="flex shrink-0 items-center">{actionNode}</div>
    </div>
  );

  if (isLoading && taskGroups.length === 0) {
    return (
      <AccordionItem value={itemKey}>
        {header}
        <AccordionContent className="[&>div]:p-0">
          <SkeletonList />
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <AccordionItem value={itemKey}>
      {header}
      <AccordionContent className="[&>div]:p-0">
        {orderedGroups.length === 0 ? (
          <div className="text-[12px] text-muted-foreground" style={{ padding: '8px 12px' }}>
            {t('taskList.kanban.emptyColumn')}
          </div>
        ) : (
          <Accordion
            multiple
            defaultValue={orderedGroups.map((g) => g.key)}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {orderedGroups.map((group) => (
              <StatusGroup group={group} key={group.key} />
            ))}
          </Accordion>
        )}
      </AccordionContent>
    </AccordionItem>
  );
});

export default TaskList;
