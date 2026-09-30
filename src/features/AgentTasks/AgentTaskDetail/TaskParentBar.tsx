import { Button, Text } from '@lobehub/ui/base-ui';
import type { TaskDetailData, TaskDetailSubtask, TaskWorkflowCategory } from '@orvilo/types';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { taskService } from '@/services/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskStatusIcon from '../features/TaskStatusIcon';
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
      <Text fontSize={RAIL_VALUE_FONT_SIZE} style={{ flex: 'none' }} type={'secondary'}>
        {t('taskDetail.subIssueOf')}
      </Text>
      <Button
        size={'small'}
        style={{ maxWidth: '100%', minWidth: 0 }}
        type={'text'}
        icon={
          workflowGlyph ? (
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
          ) : (
            <TaskStatusIcon size={16} status={parentStatus} />
          )
        }
        onClick={() =>
          navigate(taskDetailPath(parent.identifier, parentAgentId ?? undefined, parent.name))
        }
      >
        {/* Reference form: `◐ ORV-117 Handoff: …` — the identifier stays
            visible even when the name truncates. */}
        <Text ellipsis fontSize={RAIL_VALUE_FONT_SIZE} style={{ minWidth: 0 }}>
          <Text as={'span'} fontSize={RAIL_VALUE_FONT_SIZE} type={'secondary'}>
            {parent.identifier}
          </Text>
          {parent.name ? (
            <Text
              as={'span'}
              fontSize={RAIL_VALUE_FONT_SIZE}
              weight={500}
            >{` ${parent.name}`}</Text>
          ) : undefined}
        </Text>
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
