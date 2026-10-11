import type { TaskDetailData, TaskDetailSubtask, TaskWorkflowCategory } from '@orvilo/types';
import { MoreHorizontal } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskSubtaskProgressTag from '../features/TaskSubtaskProgressTag';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskWorkflowGlyph } from '../shared/TaskWorkflowBadge';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { openTaskIssueRelationModal } from './TaskIssueRelationModal';

const TASK_STATUS_SET = new Set([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
] as const);

type TaskStatus = 'backlog' | 'canceled' | 'completed' | 'failed' | 'paused' | 'running';

const toTaskStatus = (status?: string): TaskStatus =>
  status && TASK_STATUS_SET.has(status as TaskStatus) ? (status as TaskStatus) : 'backlog';

const TaskParentBar = memo(() => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const parent = useTaskDetailSelector(taskDetailSelectors.taskParent);
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const currentIdentifier = detail?.identifier;
  const taskId = useTaskDetailTaskId();
  const { allowed: canEditTask } = usePermission('create_content');
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);

  const [fetchedParentAgent, setFetchedParentAgent] = useState<
    { agentId?: string | null; identifier: string } | undefined
  >();
  const [parentSubtasks, setParentSubtasks] = useState<TaskDetailSubtask[]>([]);
  const [parentStatus, setParentStatus] = useState<TaskStatus>('backlog');
  const [parentWorkflow, setParentWorkflow] = useState<{
    category?: TaskWorkflowCategory;
    stateId?: string | null;
  }>({});
  const workflowGlyph = useTaskWorkflowGlyph({
    executionStatus: parentStatus,
    workflowCategory: parentWorkflow.category,
    workflowStateId: parentWorkflow.stateId,
  });

  useEffect(() => {
    let isActive = true;
    setFetchedParentAgent(undefined);
    setParentSubtasks([]);
    setParentStatus('backlog');
    setParentWorkflow({});
    if (!parent?.identifier) return;

    taskService
      .getDetail(parent.identifier)
      .then((res) => {
        if (!isActive) return;
        const detail = res.data as TaskDetailData;
        setFetchedParentAgent({ agentId: detail.agentId, identifier: parent.identifier });
        setParentStatus(toTaskStatus(detail.status));
        setParentWorkflow({ category: detail.workflowCategory, stateId: detail.workflowStateId });
        setParentSubtasks(detail.subtasks ?? []);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error('[TaskParentBar] Failed to load parent subtasks', err);
      });

    return () => {
      isActive = false;
    };
  }, [parent?.identifier]);

  if (!parent) return null;

  // The parent picker addresses this Issue by database id and observed revision.
  const canChangeParent = canEditTask && !!taskId && !!detail?.id && !!detail.domainRevision;
  const changeParent = () => {
    if (!canChangeParent || !taskId || !detail?.id || !detail.domainRevision) return;
    openTaskIssueRelationModal({
      expectedDomainRevision: detail.domainRevision,
      identifier: detail.identifier,
      kind: 'subIssueOf',
      onChanged: async () => {
        await Promise.all([refreshTaskDetail(taskId), refreshTaskList()]);
      },
      taskId: detail.id,
      title: t('taskDetail.parentBar.changeTitle'),
    });
  };
  // `updateTask` reports its own failure and refetches both Issues.
  const removeParent = () => {
    if (!canEditTask || !taskId) return;
    void updateTask(taskId, { parentTaskId: null }).catch(() => {});
  };

  const parentAgentId =
    parent.agentId === undefined
      ? fetchedParentAgent?.identifier === parent.identifier
        ? fetchedParentAgent.agentId
        : undefined
      : parent.agentId;

  return (
    <div className="flex items-center gap-2" style={{ maxWidth: '100%', minWidth: 0 }}>
      <div
        className="text-muted-foreground"
        style={{ flex: 'none', fontSize: RAIL_VALUE_FONT_SIZE }}
      >
        {t('taskDetail.subIssueOf')}
      </div>
      <Button
        size="sm"
        style={{ maxWidth: '100%', minWidth: 0 }}
        variant="ghost"
        onClick={() =>
          navigate(taskDetailPath(parent.identifier, parentAgentId ?? undefined, parent.name))
        }
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span style={{ display: 'inline-flex' }}>
                  <workflowGlyph.icon color={workflowGlyph.color} size={16} />
                </span>
              }
            />
            <TooltipContent>{workflowGlyph.label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Reference form: `◐ ORV-117 Handoff: …` — the identifier stays
            visible even when the name truncates. */}
        <div className="truncate block" style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}>
          <span className="text-muted-foreground" style={{ fontSize: RAIL_VALUE_FONT_SIZE }}>
            {parent.identifier}
          </span>
          {parent.name ? (
            <span
              className="font-medium"
              style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
            >{` ${parent.name}`}</span>
          ) : undefined}
        </div>
      </Button>
      {parentSubtasks.length > 0 && (
        <span style={{ flex: 'none' }}>
          <TaskSubtaskProgressTag
            currentIdentifier={currentIdentifier}
            subtasks={parentSubtasks}
            onSubtaskClick={(identifier, assigneeAgentId, name) =>
              navigate(taskDetailPath(identifier, assigneeAgentId, name))
            }
          />
        </span>
      )}
      {canEditTask && taskId && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t('taskDetail.parentBar.actions')}
                className="flex-none"
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!canChangeParent} onClick={changeParent}>
                {t('taskDetail.parentBar.change')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={removeParent}>
                {t('taskDetail.parentBar.remove')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});

export default TaskParentBar;
