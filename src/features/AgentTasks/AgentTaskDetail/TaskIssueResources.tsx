import { GitPullRequestIcon, LinkIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskMenuService } from '@/services/taskMenu';
import { taskDetailSelectors } from '@/store/task/selectors';
import { trpcErrorMessage } from '@/utils/trpcError';

import { useTaskDetailSelector } from './TaskDetailScope';

const TaskIssueResources = () => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailSelector(taskDetailSelectors.taskDatabaseId);
  const { allowed: editable } = usePermission('create_content');
  const [removing, setRemoving] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const { data, error, isLoading, mutate } = useClientDataSWR<
    Awaited<ReturnType<typeof taskMenuService.links>>
  >(taskId ? ['issue-resources', taskId] : null, () => taskMenuService.links(taskId!), {
    shouldRetryOnError: false,
  });

  const remove = async (resourceId: string) => {
    if (!editable || !taskId || removing) return;
    setRemoving(resourceId);
    setFailure(undefined);
    try {
      await taskMenuService.removeLink(taskId, resourceId);
      await mutate();
    } catch (caught) {
      setFailure(trpcErrorMessage(caught) ?? t('taskDetail.resources.failed'));
    } finally {
      setRemoving(undefined);
    }
  };

  if (!taskId) return null;
  if (!error && !isLoading && !data?.data.length) return null;
  return (
    <section aria-label={t('taskDetail.resources.title')} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('taskDetail.resources.title')}</h3>
      {error ? (
        <AsyncError
          description={trpcErrorMessage(error)}
          error={error}
          onRetry={() => void mutate()}
        />
      ) : isLoading ? (
        <Spinner />
      ) : (
        data?.data.map((resource) => {
          let href: string | undefined;
          try {
            const url = new URL(resource.url);
            if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
              href = url.href;
          } catch {
            /* Invalid imported URLs remain text. */
          }
          const Icon = resource.kind === 'pull_request' ? GitPullRequestIcon : LinkIcon;
          return (
            <div
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              key={resource.id}
            >
              <Icon className="shrink-0 text-muted-foreground" size={16} />
              {href ? (
                <a
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {resource.title}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span>
              )}
              {editable ? (
                <ActionIcon
                  disabled={!!removing}
                  icon={TrashIcon}
                  loading={removing === resource.id}
                  size="small"
                  title={t('taskDetail.resources.remove')}
                  onClick={() => void remove(resource.id)}
                />
              ) : null}
            </div>
          );
        })
      )}
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
};

export default TaskIssueResources;
