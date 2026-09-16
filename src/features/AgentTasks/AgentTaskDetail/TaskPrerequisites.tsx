import { Flexbox, Input } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { useDebounce } from 'ahooks';
import { CheckCircle2Icon, CircleDashedIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskKeys } from '@/libs/swr/keys';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

function PrerequisitePanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed, reason } = usePermission('create_content');
  const detail = useTaskStore(taskDetailSelectors.taskDetailById(taskId));
  const addDependency = useTaskStore((s) => s.addDependency);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const removeDependencyById = useTaskStore((s) => s.removeDependencyById);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const debouncedQuery = useDebounce(query.trim(), { wait: 250 });
  const { data, error, isLoading, mutate } = useClientDataSWR(
    open ? taskKeys.dependencyCandidates(taskId, debouncedQuery) : null,
    () => taskService.searchDependencyCandidates(taskId, debouncedQuery),
  );
  const dependencies = detail?.dependencies?.filter((d) => d.type === 'blocks') ?? [];
  const locked = detail?.status === 'running' || detail?.status === 'completed';
  const canAdd = allowed && !locked && !busy;

  const change = async (operation: () => Promise<void>) => {
    if (busy || !allowed) return;
    setBusy(true);
    setMutationError(undefined);
    try {
      await operation();
      setOpen(false);
      setQuery('');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : t('taskDetail.prerequisites.saveError'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flexbox
      aria-label={t('taskDetail.prerequisites.title')}
      gap={8}
      role="region"
      style={{ padding: '16px 8px', minWidth: 0 }}
    >
      <Flexbox horizontal align="center" justify="space-between">
        <Text weight={500}>{t('taskDetail.prerequisites.title')}</Text>
        <Button
          aria-label={t('taskDetail.prerequisites.add')}
          disabled={!canAdd}
          icon={PlusIcon}
          size="small"
          title={!allowed ? reason : locked ? t('taskDetail.prerequisites.locked') : undefined}
          onClick={() => setOpen(!open)}
        />
      </Flexbox>
      <Text fontSize={12} type="secondary">
        {!(detail?.dependenciesSatisfied ?? dependencies.every((d) => d.status === 'completed'))
          ? t('taskDetail.prerequisites.blocked')
          : dependencies.length > 0
            ? t('taskDetail.prerequisites.satisfied')
            : t('taskDetail.prerequisites.empty')}
      </Text>
      {dependencies.map((dependency) => (
        <Flexbox
          horizontal
          align="center"
          gap={8}
          key={dependency.dependencyId ?? dependency.dependsOn}
        >
          {dependency.status === 'completed' ? (
            <CheckCircle2Icon size={14} />
          ) : (
            <CircleDashedIcon size={14} />
          )}
          <Flexbox flex={1} style={{ minWidth: 0 }}>
            {dependency.inaccessible ? (
              <Text fontSize={12}>{t('taskDetail.prerequisites.unavailable')}</Text>
            ) : (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
                onClick={() => navigate(`/task/${dependency.dependsOn}`)}
              >
                {dependency.dependsOn}
                {dependency.name ? ` · ${dependency.name}` : ''}
              </button>
            )}
            {!dependency.inaccessible && dependency.status && (
              <Text fontSize={12} type="secondary">
                {t(`taskDetail.status.${dependency.status}` as never)}
              </Text>
            )}
          </Flexbox>
          <Button
            disabled={!allowed || busy}
            icon={XIcon}
            size="small"
            aria-label={t('taskDetail.prerequisites.remove', {
              task: dependency.dependsOn || t('taskDetail.prerequisites.unavailable'),
            })}
            onClick={() =>
              void change(() =>
                dependency.dependencyId
                  ? removeDependencyById(taskId, dependency.dependencyId)
                  : removeDependency(taskId, dependency.dependsOn),
              )
            }
          />
        </Flexbox>
      ))}
      {mutationError && (
        <Text role="alert" type="danger">
          {mutationError}
        </Text>
      )}
      {open && (
        <Flexbox gap={8}>
          <Input
            aria-label={t('taskDetail.prerequisites.search')}
            maxLength={200}
            placeholder={t('taskDetail.prerequisites.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {isLoading && <Text role="status">{t('taskDetail.prerequisites.loading')}</Text>}
          {error ? (
            <Flexbox gap={4}>
              <Text role="alert">{t('taskDetail.prerequisites.loadError')}</Text>
              <Button onClick={() => void mutate()}>{t('taskDetail.prerequisites.retry')}</Button>
            </Flexbox>
          ) : (
            <Flexbox gap={4} style={{ maxHeight: 260, overflow: 'auto' }}>
              {!isLoading && data?.data.length === 0 && (
                <Text>{t('taskDetail.prerequisites.noResults')}</Text>
              )}
              {data?.data.map((candidate) => (
                <Button
                  disabled={!canAdd || query.trim() !== debouncedQuery}
                  key={candidate.id}
                  style={{ justifyContent: 'flex-start', whiteSpace: 'normal' }}
                  onClick={() => void change(() => addDependency(taskId, candidate.id, 'blocks'))}
                >
                  {candidate.identifier}
                  {candidate.name ? ` · ${candidate.name}` : ''}
                </Button>
              ))}
              {data?.hasMore && <Text fontSize={12}>{t('taskDetail.prerequisites.more')}</Text>}
            </Flexbox>
          )}
        </Flexbox>
      )}
    </Flexbox>
  );
}

export default function TaskPrerequisites() {
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  // Task switches reset the picker and isolate in-flight mutation feedback.
  return taskId ? <PrerequisitePanel key={taskId} taskId={taskId} /> : null;
}
