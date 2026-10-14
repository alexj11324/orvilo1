import { GitPullRequestIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { confirmModal } from '@/components/Modal';
import { Spinner } from '@/components/ui/spinner';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskMenuService } from '@/services/taskMenu';
import { taskDetailSelectors } from '@/store/task/selectors';
import { trpcErrorMessage } from '@/utils/trpcError';

import { issueResourceRef } from './issueResourceRef';
import { useTaskDetailSelector } from './TaskDetailScope';
import TaskDetailSectionHeader from './TaskDetailSectionHeader';
import { openTaskIssueResourceTitleModal } from './TaskIssueResourceTitleModal';
import { ISSUE_RESOURCE_KINDS, useIssueDetailActions } from './useIssueDetailActions';

/**
 * Links and pull requests attached to the issue. The header "+" holds the add
 * menu (link / pull request / document), so an editor keeps the header even
 * before anything is attached — with the mid-page add row gone it is where
 * the first resource comes from. A viewer sees the section only once it has
 * content.
 */
const TaskIssueResources = () => {
  const { t } = useTranslation('chat');
  const taskId = issueResourceRef(useTaskDetailSelector(taskDetailSelectors.taskDetail));
  const { allowed: editable } = usePermission('create_content');
  const { addResource, capabilities } = useIssueDetailActions();
  const [isExpanded, setIsExpanded] = useState(true);
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

  // Removing is not undoable from here, so it asks first and names the link.
  const confirmRemove = (resource: { id: string; title: string }) => {
    if (!editable || !taskId || removing) return;
    confirmModal({
      content: t('taskDetail.resources.removeConfirm.content', { title: resource.title }),
      okButtonProps: { danger: true },
      okText: t('taskDetail.resources.removeConfirm.ok'),
      onOk: () => remove(resource.id),
      title: t('taskDetail.resources.removeConfirm.title'),
    });
  };

  if (!taskId) return null;
  if (!error && !isLoading && !data?.data.length && !capabilities.canAddResource) return null;
  return (
    <section aria-label={t('taskDetail.resources.title')} className="flex flex-col gap-2">
      <TaskDetailSectionHeader
        count={data?.data.length}
        icon={LinkIcon}
        open={isExpanded}
        title={t('taskDetail.resources.title')}
        actions={
          capabilities.canAddResource ? (
            <SidebarDropdownMenu
              items={ISSUE_RESOURCE_KINDS.map(([kind, Icon]) => ({
                icon: <Icon />,
                key: `add-${kind}`,
                label: t(`taskDetail.menu.add.${kind}`),
                onClick: () => addResource(kind),
              }))}
            >
              <ActionIcon
                aria-label={t('taskDetail.resources.add')}
                icon={PlusIcon}
                size="small"
                title={t('taskDetail.resources.add')}
              />
            </SidebarDropdownMenu>
          ) : undefined
        }
        onToggle={() => setIsExpanded((prev) => !prev)}
      />
      {!isExpanded ? null : error ? (
        <AsyncError
          description={trpcErrorMessage(error)}
          error={error}
          onRetry={() => void mutate()}
        />
      ) : isLoading ? (
        <Spinner />
      ) : (
        data?.data.map((resource) => {
          // Only a plain http(s) URL without embedded credentials becomes a link.
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
              className="flex items-center gap-2 rounded-(--radius-card) border border-border px-3 py-2"
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
                <>
                  <ActionIcon
                    disabled={!!removing}
                    icon={PencilIcon}
                    size="small"
                    title={t('taskDetail.resources.edit')}
                    onClick={() =>
                      openTaskIssueResourceTitleModal({
                        onChanged: () => mutate(),
                        resource,
                        taskId,
                      })
                    }
                  />
                  <ActionIcon
                    disabled={!!removing}
                    icon={TrashIcon}
                    loading={removing === resource.id}
                    size="small"
                    title={t('taskDetail.resources.remove')}
                    onClick={() => confirmRemove(resource)}
                  />
                </>
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
