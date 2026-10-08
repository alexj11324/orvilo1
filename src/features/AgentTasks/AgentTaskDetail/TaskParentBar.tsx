import type { TaskDetailData, TaskDetailSubtask, TaskWorkflowCategory } from '@orvilo/types';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { taskService } from '@/services/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskSubtaskProgressTag from '../features/TaskSubtaskProgressTag';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskWorkflowGlyph } from '../shared/TaskWorkflowBadge';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { useTaskDetailSelector } from './TaskDetailScope';

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
  const currentIdentifier = useTaskDetailSelector(taskDetailSelectors.taskDetail)?.identifier;

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
    </div>
  );
});

export default TaskParentBar;
