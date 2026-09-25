import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Input, Text } from '@lobehub/ui/base-ui';
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

/** The Related rail lists ordinary links and explicit blocking prerequisites. */
const TaskPrerequisiteEditor = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed, reason } = usePermission('create_content');
  const detail = useTaskStore(taskDetailSelectors.activeTaskDetail);
  const addDependency = useTaskStore((s) => s.addDependency);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const removeIssueRelation = useTaskStore((s) => s.removeIssueRelation);
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const dependencies = useMemo(() => detail?.dependencies ?? [], [detail?.dependencies]);
  // Blocking edges first: the hint talks about them and they gate runs, so
  // they stay on top even though the section now reads "Related".
  const orderedDeps = useMemo(
    () => [
      ...dependencies.filter((dep) => dep.type === 'blocks'),
      ...dependencies.filter((dep) => dep.type !== 'blocks'),
    ],
    [dependencies],
  );
  const removalTotals = new Map<string, number>();
  for (const dep of orderedDeps) {
    const key = `${dep.type}:${dep.dependsOn}`;
    removalTotals.set(key, (removalTotals.get(key) ?? 0) + 1);
  }
  const removalSeen = new Map<string, number>();
  const removalIdentifiers = orderedDeps.map((dep) => {
    const key = `${dep.type}:${dep.dependsOn}`;
    if (removalTotals.get(key) === 1) return dep.dependsOn;
    const position = (removalSeen.get(key) ?? 0) + 1;
    removalSeen.set(key, position);
    return t('taskDetail.prerequisites.relationPosition', {
      identifier: dep.dependsOn,
      position,
    });
  });
  const prerequisites = dependencies.filter((dep) => dep.type === 'blocks');
  const blocked = prerequisites.some((dep) => dep.status !== 'completed');

  const change = async (operation: () => Promise<void>, adding = false) => {
    if (!allowed || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await operation();
      if (adding) setIdentifier('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const key = message.includes('blocking relationship')
        ? 'relationConflict'
        : message.includes('cycle')
          ? 'cycle'
          : message.includes('itself')
            ? 'self'
            : message.includes('project boundaries')
              ? 'project'
              : message.includes('Pause or reopen')
                ? 'active'
                : /not found|unavailable/i.test(message)
                  ? 'unavailable'
                  : 'error';
      setError(t(`taskDetail.prerequisites.${key}`));
    } finally {
      setPending(false);
    }
  };

  return (
    <Flexbox className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.related')}</span>
      {(blocked || prerequisites.length > 0 || dependencies.length === 0) && (
        <Text fontSize={12} role={'status'} style={{ paddingInline: 8 }} type={'secondary'}>
          {t(
            blocked
              ? 'taskDetail.prerequisites.blocked'
              : prerequisites.length
                ? 'taskDetail.prerequisites.ready'
                : 'taskDetail.prerequisites.empty',
          )}
        </Text>
      )}
      {orderedDeps.map((dep, index) => {
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
                  {t(
                    dep.type === 'blocks'
                      ? 'taskDetail.prerequisites.blockedBy'
                      : 'taskDetail.prerequisites.related',
                  )}{' '}
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
                aria-label={t(
                  dep.type === 'blocks'
                    ? 'taskDetail.prerequisites.removeBlocker'
                    : 'taskDetail.prerequisites.removeRelated',
                  { identifier: removalIdentifiers[index] },
                )}
                onClick={() =>
                  change(() =>
                    dep.relationId
                      ? removeIssueRelation(taskId, dep.relationId)
                      : removeDependency(
                          taskId,
                          dep.id!,
                          dep.type === 'relates' ? 'relates' : 'blocks',
                        ),
                  )
                }
              />
            )}
          </Flexbox>
        );
      })}
      {allowed && (
        <form
          style={{ paddingInline: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            const value = identifier.trim();
            if (value) void change(() => addDependency(taskId, value, 'relates'), true);
          }}
        >
          <Flexbox horizontal gap={4}>
            <Input
              aria-label={t('taskDetail.prerequisites.input')}
              disabled={pending}
              placeholder={t('taskDetail.prerequisites.placeholder')}
              size={'small'}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
            <Button
              disabled={!identifier.trim() || pending}
              htmlType={'submit'}
              loading={pending}
              size={'small'}
            >
              {t('taskDetail.prerequisites.add')}
            </Button>
          </Flexbox>
        </form>
      )}
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
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  // Remount local input/error/pending state when navigating between issues.
  return taskId ? <TaskPrerequisiteEditor key={taskId} taskId={taskId} /> : null;
};

export default TaskPrerequisites;
