import { type TreeDataNode } from '@lobehub/ui/base-ui';
import { Tree } from '@lobehub/ui/base-ui';
import type { TaskDetailSubtask } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { ListTodoIcon, PlayCircle, Plus } from 'lucide-react';
import type { MouseEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { SidebarContextMenuPopup } from '@/features/NavPanel/components/SidebarContextMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { showContextMenuWithFallback } from '@/libs/contextMenu';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import CreateTaskInlineEntry from '../AgentTaskList/CreateTaskInlineEntry';
import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import IssueStatusPicker from '../features/IssueStatusPicker';
import TaskPriorityTag from '../features/TaskPriorityTag';
import TaskSubtaskProgressTag from '../features/TaskSubtaskProgressTag';
import TaskTriggerTag from '../features/TaskTriggerTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useTaskContextMenuActions } from '../features/useTaskItemContextMenu';
import AccordionArrowIcon from '../shared/AccordionArrowIcon';
import { shouldShowMemberAssignee } from '../shared/memberAssigneeMode';
import { styles } from '../shared/style';
import { taskDetailPath } from '../shared/taskDetailPath';
import RunSubtasksPreview from './RunSubtasksPreview';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

type TaskStatus = 'backlog' | 'canceled' | 'completed' | 'failed' | 'paused' | 'running';

const TASK_STATUS_SET = new Set<TaskStatus>([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
]);

const toTaskStatus = (status: string): TaskStatus =>
  TASK_STATUS_SET.has(status as TaskStatus) ? (status as TaskStatus) : 'backlog';

interface TaskTreeNode {
  children: TaskTreeNode[];
  task: TaskDetailSubtask;
}

const buildTree = (subtasks: TaskDetailSubtask[]): TaskTreeNode[] =>
  subtasks.map((task) => ({
    children: buildTree(task.children ?? []),
    task,
  }));

const SubtaskTitle = memo<{ task: TaskDetailSubtask }>(({ task }) => {
  const status = toTaskStatus(task.status);
  const isRunning = status === 'running';
  const handoffTask = useTaskStore((s) => s.handoffTask);
  const hasName = !!task.name;
  const activeWorkspaceId = useActiveWorkspaceId();

  return (
    <div className="flex items-center justify-between gap-2" style={{ minWidth: 0, width: '100%' }}>
      <span
        style={{ alignItems: 'center', display: 'inline-flex', flex: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <TaskPriorityTag priority={task.priority} size={14} taskIdentifier={task.identifier} />
      </span>
      <span
        style={{ alignItems: 'center', display: 'inline-flex', flex: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <IssueStatusPicker
          size={14}
          taskIdentifier={task.identifier}
          workflowCategory={task.workflowCategory}
          workflowStateId={task.workflowStateId}
        />
      </span>
      {hasName && (
        <div className="font-mono text-xs text-muted-foreground" style={{ flex: 'none' }}>
          {task.identifier}
        </div>
      )}
      <div className="truncate block text-sm" style={{ flex: 1, minWidth: 0 }}>
        {task.name || task.identifier}
      </div>
      {task.automationMode ? (
        <span
          style={{ alignItems: 'center', display: 'inline-flex', flex: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <TaskTriggerTag
            automationMode={task.automationMode}
            heartbeatInterval={task.heartbeat?.interval}
            schedulePattern={task.schedule?.pattern}
            scheduleTimezone={task.schedule?.timezone}
          />
        </span>
      ) : null}
      <div className="flex flex-none items-center gap-1">
        {shouldShowMemberAssignee(activeWorkspaceId, task.assigneeUserId) && (
          <AssigneeMemberSelector
            currentUserId={task.assigneeUserId ?? null}
            disabled={isRunning}
            taskCreatorId={task.createdByUserId}
            taskIdentifier={task.identifier}
            taskVisibility={task.visibility}
          >
            <span
              style={{
                alignItems: 'center',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                flex: 'none',
              }}
            >
              {task.assigneeUserId ? (
                <AssigneeUserAvatar size={18} userId={task.assigneeUserId} />
              ) : (
                <UnassignedAssigneeIcon kind={'human'} />
              )}
            </span>
          </AssigneeMemberSelector>
        )}
        <AssigneeAgentSelector
          currentAgentId={task.assignee?.id ?? null}
          taskIdentifier={task.identifier}
          taskVisibility={task.visibility}
          onHandoff={isRunning ? (agentId) => handoffTask(task.identifier, agentId) : undefined}
        >
          <span
            style={{
              alignItems: 'center',
              cursor: 'pointer',
              display: 'inline-flex',
              flex: 'none',
            }}
          >
            <AssigneeAvatar agentId={task.assignee?.id} size={18} />
          </span>
        </AssigneeAgentSelector>
      </div>
    </div>
  );
});

const toTreeData = (tree: TaskTreeNode[]): TreeDataNode[] => {
  return tree.map((node) => ({
    children: toTreeData(node.children),
    key: node.task.identifier,
    title: <SubtaskTitle task={node.task} />,
  }));
};

const TaskSubtasks = memo(() => {
  const { t } = useTranslation('chat');

  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canEditTask, reason } = usePermission('create_content');
  const agentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  // Subtask composers inherit the parent's visibility as their default — a
  // child under a private parent must not default to workspace-visible (the
  // server rejects a subtask more public than its parent).
  const parentVisibility = useTaskDetailSelector(taskDetailSelectors.taskVisibility);
  const subtasks = useTaskDetailSelector(taskDetailSelectors.taskSubtasks);
  const taskId = useTaskDetailTaskId();
  const runReadySubtasks = useTaskStore((s) => s.runReadySubtasks);

  const { buildItems, installKeyboardHandlers } = useTaskContextMenuActions();

  const [isCreating, setIsCreating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    anchor: { getBoundingClientRect: () => DOMRect };
    items: NativeContextMenuItem[];
  } | null>(null);

  const subtaskMap = useMemo(() => {
    const map = new Map<string, TaskDetailSubtask>();
    const walk = (items: TaskDetailSubtask[]) => {
      for (const item of items) {
        map.set(item.identifier, item);
        if (item.children?.length) walk(item.children);
      }
    };
    walk(subtasks);
    return map;
  }, [subtasks]);

  const handleNavigate = useCallback(
    (identifier: string) => {
      const subtask = subtaskMap.get(identifier);
      navigate(taskDetailPath(identifier, subtask?.assignee?.id ?? undefined, subtask?.name));
    },
    [navigate, subtaskMap],
  );

  const treeData = useMemo(() => {
    if (subtasks.length === 0) return [];
    return toTreeData(buildTree(subtasks));
  }, [subtasks]);

  const handleRightClick = useCallback(
    ({ event, node }: { event: MouseEvent; node: TreeDataNode }) => {
      if (!canEditTask) return;
      const subtask = subtaskMap.get(node.key);
      if (!subtask) return;
      event.preventDefault();
      const target = {
        assigneeAgentId: subtask.assignee?.id,
        assigneeUserId: subtask.assigneeUserId,
        createdByUserId: subtask.createdByUserId,
        identifier: subtask.identifier,
        name: subtask.name,
        priority: subtask.priority,
        status: subtask.status,
        visibility: subtask.visibility,
        workflowCategory: subtask.workflowCategory,
        workflowStateId: subtask.workflowStateId,
      };
      const items = buildItems(target);
      // The tree's right-click channel is not a DOM trigger: the native popup
      // still wins on desktop, and the web fallback opens a ReUI menu anchored
      // at the pointer.
      let openedWebMenu = false;
      showContextMenuWithFallback(items, undefined, () => {
        openedWebMenu = true;
        setContextMenu({
          anchor: {
            getBoundingClientRect: () =>
              DOMRect.fromRect({ height: 0, width: 0, x: event.clientX, y: event.clientY }),
          },
          items,
        });
      });
      installKeyboardHandlers(target, openedWebMenu ? () => setContextMenu(null) : undefined);
    },
    [canEditTask, subtaskMap, buildItems, installKeyboardHandlers],
  );

  const toggleCreating = useCallback(() => {
    if (!canEditTask) return;
    setIsCreating((prev) => !prev);
  }, [canEditTask]);

  const handleRunAll = useCallback(async () => {
    if (!canEditTask) return;
    if (!taskId || isPlanning) return;
    setIsPlanning(true);
    try {
      const preview = await taskService.previewSubtaskLayers(taskId);
      const plan = preview.data;

      // No runnable layer AND nothing informative to show → just a toast.
      // If there are externally-blocked or cycled tasks, still open the modal
      // so the user understands why "Run all" can't start anything right now.
      const hasInformativeState =
        plan.blockedExternally.length > 0 ||
        plan.blockedByCycle.length > 0 ||
        plan.cycles.length > 0;
      if (plan.totalRunnable === 0 && !hasInformativeState) {
        toast.info(t('taskDetail.runAll.empty'));
        return;
      }

      const canRun = plan.totalRunnable > 0;
      confirmModal({
        cancelText: t('taskDetail.runAll.cancel'),
        content: <RunSubtasksPreview plan={plan} />,
        okButtonProps: canRun ? undefined : { disabled: true },
        okText: t('taskDetail.runAll.confirm', { count: plan.totalRunnable }),
        onOk: async () => {
          if (!canRun) return;
          const res = await runReadySubtasks(taskId);
          const kicked = res.data.kickedOff.length;
          const failed = res.data.failed?.length ?? 0;
          if (failed > 0) {
            toast.warning(
              t('taskDetail.runAll.partialFailure', {
                count: failed,
                failed,
                ok: kicked,
                total: kicked + failed,
              }),
            );
          } else {
            toast.success(t('taskDetail.runAll.kickedOff', { count: kicked }));
          }
        },
        title: t('taskDetail.runAll.title'),
      });
    } catch (error) {
      console.error('[TaskSubtasks] Failed to plan subtasks:', error);
      toast.error(t('taskDetail.updateFailed'));
    } finally {
      setIsPlanning(false);
    }
  }, [canEditTask, taskId, isPlanning, t, runReadySubtasks]);

  if (!taskId) return null;

  const hasSubtasks = subtasks.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {hasSubtasks ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                aria-expanded={isExpanded}
                className="gap-2 text-sm font-medium text-muted-foreground"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                <ListTodoIcon color={cssVar.colorTextDescription} size={16} />
                <span>{t('taskDetail.subtasks')}</span>
                <AccordionArrowIcon
                  isOpen={isExpanded}
                  style={{ color: cssVar.colorTextDescription }}
                />
              </Button>
              <TaskSubtaskProgressTag
                currentIdentifier={taskId}
                subtasks={subtasks}
                onSubtaskClick={handleNavigate}
              />
            </div>
            <div className="flex items-center gap-1">
              <ActionIcon
                disabled={!canEditTask || isPlanning}
                icon={PlayCircle}
                loading={isPlanning}
                size="small"
                title={canEditTask ? t('taskDetail.runAll') : reason}
                onClick={handleRunAll}
              />
              <ActionIcon
                disabled={!canEditTask}
                icon={Plus}
                size="small"
                title={canEditTask ? t('taskDetail.addSubtask') : reason}
                onClick={toggleCreating}
              />
            </div>
          </div>
          <Collapsible open={isExpanded}>
            <CollapsibleContent>
              <div className="flex flex-col gap-2">
                {isCreating && (
                  <CreateTaskInlineEntry
                    autoFocus
                    agentId={agentId ?? undefined}
                    defaultVisibility={parentVisibility}
                    parentTaskId={taskId}
                    placeholder={t('taskDetail.subtaskInstructionPlaceholder')}
                    onCollapse={() => setIsCreating(false)}
                    onCreated={() => setIsCreating(false)}
                  />
                )}
                <Tree
                  blockNode
                  defaultExpandAll
                  showLine
                  classNames={{ title: styles.subtaskTreeTitle }}
                  styles={{ node: { height: 36 } }}
                  treeData={treeData}
                  onRightClick={handleRightClick}
                  onSelect={(keys) => {
                    if (keys[0]) handleNavigate(keys[0]);
                  }}
                />
                <SidebarContextMenuPopup
                  anchor={contextMenu?.anchor}
                  items={contextMenu?.items ?? []}
                  open={Boolean(contextMenu)}
                  onOpenChange={(open) => {
                    if (!open) setContextMenu(null);
                  }}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <>
          <Button
            className="w-fit gap-2 text-sm font-medium text-muted-foreground"
            size="sm"
            title={canEditTask ? undefined : reason}
            type="button"
            variant="ghost"
            onClick={toggleCreating}
          >
            <Plus color={cssVar.colorTextDescription} size={16} />
            <span>{t('taskDetail.addSubtask')}</span>
          </Button>
          {isCreating && (
            <CreateTaskInlineEntry
              autoFocus
              agentId={agentId ?? undefined}
              defaultVisibility={parentVisibility}
              parentTaskId={taskId}
              placeholder={t('taskDetail.subtaskInstructionPlaceholder')}
              onCollapse={() => setIsCreating(false)}
              onCreated={() => setIsCreating(false)}
            />
          )}
        </>
      )}
    </div>
  );
});

export default TaskSubtasks;
