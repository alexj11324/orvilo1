import { Flexbox } from '@lobehub/ui';
import { Button, Input, Text } from '@lobehub/ui/base-ui';
import { CheckIcon, LockKeyholeIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';

const TaskPrerequisiteEditor = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed, reason } = usePermission('create_content');
  const detail = useTaskStore(taskDetailSelectors.activeTaskDetail);
  const addDependency = useTaskStore((s) => s.addDependency);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const prerequisites = detail?.dependencies?.filter((dep) => dep.type === 'blocks') ?? [];
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
      const key = message.includes('cycle')
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
    <Flexbox gap={8} style={{ marginTop: 16, minWidth: 0 }}>
      <Text weight={500}>{t('taskDetail.prerequisites.title')}</Text>
      <Text fontSize={12} role={'status'} type={'secondary'}>
        {t(
          blocked
            ? 'taskDetail.prerequisites.blocked'
            : prerequisites.length
              ? 'taskDetail.prerequisites.ready'
              : 'taskDetail.prerequisites.empty',
        )}
      </Text>
      {prerequisites.map((dep) => (
        <Flexbox horizontal align={'center'} gap={4} key={dep.id ?? dep.dependsOn}>
          <Button
            disabled={!dep.status}
            icon={dep.status === 'completed' ? CheckIcon : LockKeyholeIcon}
            size={'small'}
            style={{ flex: 1, minWidth: 0 }}
            type={'text'}
            onClick={() => navigate(taskDetailPath(dep.dependsOn, undefined, dep.name))}
          >
            <Text ellipsis title={dep.name ?? dep.dependsOn}>
              {dep.status
                ? `${dep.dependsOn}${dep.name ? ` · ${dep.name}` : ''}`
                : t('taskDetail.prerequisites.unavailable')}
            </Text>
          </Button>
          {allowed && (
            <Button
              aria-label={t('taskDetail.prerequisites.remove', { identifier: dep.dependsOn })}
              disabled={pending}
              icon={XIcon}
              size={'small'}
              type={'text'}
              onClick={() => change(() => removeDependency(taskId, dep.id ?? dep.dependsOn))}
            />
          )}
        </Flexbox>
      ))}
      {allowed && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = identifier.trim();
            if (value) void change(() => addDependency(taskId, value, 'blocks'), true);
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
        <Text fontSize={12} type={'secondary'}>
          {reason}
        </Text>
      )}
      {error && (
        <Text fontSize={12} role={'alert'} type={'danger'}>
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
