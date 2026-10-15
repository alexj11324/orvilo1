import { EllipsisIcon, Link2Icon, PlusIcon } from 'lucide-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import { openProjectLinkModal } from './ProjectLinkModal';

const styles = {
  link: 'inline-flex h-8 max-w-60 items-center gap-1.5 rounded-(--radius-button) px-1.5 text-sm leading-5.5 text-foreground no-underline hover:bg-accent group-focus-visible/project-resource:bg-accent [&_span]:truncate [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11',
};

export function ProjectLinks({ projectId }: { projectId: string; ownerId: string | null }) {
  const { t } = useTranslation('project');
  const query = useProjectStore((s) => s.useFetchProjectLinks)(projectId);
  const remove = useProjectStore((s) => s.removeProjectLink);
  const canEdit = useCurrentProjectDetail(projectId)?.capabilities?.canEdit === true;
  const links = query.data?.data ?? [];
  return (
    <div className="flex flex-row items-center gap-1 flex-wrap">
      {query.isLoading && !query.data && <Skeleton className="h-7 w-30" />}
      {query.error && (
        <AsyncError
          error={query.error}
          retrying={query.isValidating}
          variant="inline"
          onRetry={() => void query.mutate()}
        />
      )}
      {links.map((link) => (
        <div className="flex flex-row items-center gap-0" key={link.id}>
          <a
            className="group/project-resource inline-flex min-w-0 rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            href={link.url}
            rel="noopener noreferrer"
            target="_blank"
            title={link.title || link.url}
          >
            <span className={styles.link}>
              <Link2Icon size={16} />
              <span>{link.title || link.url}</span>
            </span>
          </a>
          {canEdit && (
            <DropdownMenu
              items={[
                {
                  key: 'edit',
                  label: t('resources.link.edit'),
                  onClick: () => openProjectLinkModal({ projectId, link }),
                },
                {
                  key: 'remove',
                  label: t('resources.remove'),
                  onClick: async () => {
                    try {
                      const result = await remove(projectId, link.id);
                      if (result.refreshError)
                        toast.error(t('resources.link.removedReadbackError'));
                    } catch {
                      toast.error(t('resources.link.removeError'));
                    }
                  },
                },
              ]}
            >
              <Button
                aria-label={t('resources.link.actions', { title: link.title || link.url })}
                className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                size="icon"
                variant="ghost"
              >
                {createElement(EllipsisIcon, { 'size': 16, 'aria-hidden': true })}
              </Button>
            </DropdownMenu>
          )}
        </div>
      ))}
      {canEdit && (
        <DropdownMenu
          items={[
            {
              key: 'link',
              icon: <Link2Icon size={16} />,
              label: t('resources.link.menu'),
              onClick: () => openProjectLinkModal({ projectId }),
            },
          ]}
        >
          <Button
            multiline
            aria-label={t('overview.resourcesAdd')}
            className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 max-w-full [overflow-wrap:anywhere]"
            size="compact"
            variant="ghost"
          >
            {createElement(links.length ? PlusIcon : Link2Icon, {
              'size': 16,
              'aria-hidden': true,
            })}
            {links.length ? null : t('overview.resourcesAdd')}
          </Button>
        </DropdownMenu>
      )}
    </div>
  );
}
