import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- unreadable-dependency placeholder, not a status
import { CircleDashed, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskStatusIcon from '../features/TaskStatusIcon';
import { taskDetailPath } from '../shared/taskDetailPath';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const TASK_STATUS_SET = new Set<string>([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
  'scheduled',
]);

const toTaskStatus = (status?: string | null): TaskStatus =>
  status && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : 'backlog';

/** The Prerequisites rail lists explicit blocking prerequisites that gate runs. */
const TaskPrerequisiteEditor = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed, reason } = usePermission('create_content');
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const removeIssueRelation = useTaskStore((s) => s.removeIssueRelation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const prerequisites = useMemo(
    () => (detail?.dependencies ?? []).filter((dep) => dep.type === 'blocks'),
    [detail?.dependencies],
  );
  const removalTotals = new Map<string, number>();
  for (const dep of prerequisites) {
    const key = `${dep.type}:${dep.dependsOn}`;
    removalTotals.set(key, (removalTotals.get(key) ?? 0) + 1);
  }
  const removalSeen = new Map<string, number>();
  const removalIdentifiers = prerequisites.map((dep) => {
    const key = `${dep.type}:${dep.dependsOn}`;
    if (removalTotals.get(key) === 1) return dep.dependsOn;
    const position = (removalSeen.get(key) ?? 0) + 1;
    removalSeen.set(key, position);
    return t('taskDetail.prerequisites.relationPosition', {
      identifier: dep.dependsOn,
      position,
    });
  });
  const blocked = prerequisites.some((dep) => dep.status !== 'completed');

  const change = async (operation: () => Promise<void>) => {
    if (!allowed || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await operation();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const key = /not found|unavailable/i.test(message) ? 'unavailable' : 'error';
      setError(t(`taskDetail.prerequisites.${key}`));
    } finally {
      setPending(false);
    }
  };

  return (
    <Flexbox className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.prerequisites.title')}</span>
      <Text fontSize={12} role={'status'} style={{ paddingInline: 8 }} type={'secondary'}>
        {t(
          blocked
            ? 'taskDetail.prerequisites.blocked'
            : prerequisites.length
              ? 'taskDetail.prerequisites.ready'
              : 'taskDetail.prerequisites.empty',
        )}
      </Text>
      {prerequisites.map((dep, index) => {
        const unavailable = !dep.status;
        const workflowVisual =
          dep.workflowStateId && dep.workflowCategory
            ? WORKFLOW_CATEGORY_VISUALS[dep.workflowCategory]
            : undefined;
        return (
          <Flexbox
            horizontal
            align={'center'}
            gap={2}
            key={dep.relationId ?? `${dep.type}:${dep.id ?? dep.dependsOn}`}
          >
            <Button
              disabled={unavailable}
              size={'small'}
              style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
              title={dep.name ?? dep.dependsOn}
              type={'text'}
              icon={
                unavailable ? (
                  <Icon icon={CircleDashed} size={16} style={{ color: 'inherit' }} />
                ) : workflowVisual ? (
                  <Icon color={workflowVisual.color} icon={workflowVisual.icon} size={16} />
                ) : (
                  <TaskStatusIcon size={16} status={toTaskStatus(dep.status)} />
                )
              }
              onClick={() => navigate(taskDetailPath(dep.dependsOn, undefined, dep.name))}
            >
              <Text ellipsis fontSize={RAIL_VALUE_FONT_SIZE} style={{ minWidth: 0 }}>
                <Text as={'span'} fontSize={RAIL_VALUE_FONT_SIZE} type={'secondary'}>
                  {t('taskDetail.prerequisites.blockedBy')}{' '}
                </Text>
                <Text as={'span'} fontSize={RAIL_VALUE_FONT_SIZE} type={'secondary'}>
                  {dep.dependsOn}
                </Text>
                {dep.name ? ` · ${dep.name}` : ''}
                {unavailable ? ` · ${t('taskDetail.prerequisites.unavailable')}` : ''}
              </Text>
            </Button>
            {allowed && (dep.relationId || dep.id) && (
              <Button
                disabled={pending}
                icon={XIcon}
                size={'small'}
                type={'text'}
                aria-label={t('taskDetail.prerequisites.removeBlocker', {
                  identifier: removalIdentifiers[index],
                })}
                onClick={() =>
                  change(() =>
                    dep.relationId
                      ? removeIssueRelation(taskId, dep.relationId)
                      : removeDependency(taskId, dep.id!, 'blocks'),
                  )
                }
              />
            )}
          </Flexbox>
        );
      })}
      {!allowed && reason && (
        <Text fontSize={12} style={{ paddingInline: 8 }} type={'secondary'}>
          {reason}
        </Text>
      )}
      {error && (
        <Text fontSize={12} role={'alert'} style={{ paddingInline: 8 }} type={'danger'}>
          {error}
        </Text>
      )}
    </Flexbox>
  );
};

const TaskPrerequisites = () => {
  const taskId = useTaskDetailTaskId();
  // Remount local error/pending state when navigating between issues.
  return taskId ? <TaskPrerequisiteEditor key={taskId} taskId={taskId} /> : null;
};

export default TaskPrerequisites;
