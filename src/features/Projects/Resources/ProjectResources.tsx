'use client';
import { cn } from 'cn';
import { BookOpen, LibraryBigIcon, Plus, Unlink } from 'lucide-react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getProjectLibraryPath } from '@/features/Projects/Layout/navigation';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { projectService } from '@/services/project';
import type { ProjectDetail } from '@/store/project';

import { openAddResourceModal } from './AddResourceModal';

const styles = {
  card: 'rounded-(--radius-card) border border-sidebar-border bg-[color-mix(in_srgb,var(--card)_82%,var(--ant-color-fill-quaternary))] p-4 hover:border-border',
  icon: 'flex size-9 flex-none items-center justify-center rounded-(--radius-card) bg-fill-quaternary text-primary',
  list: 'grid gap-2.5',
};

type ProjectResourceLink = NonNullable<ProjectDetail['knowledgeBases']>[number];

interface ProjectResourcesProps {
  detail: ProjectDetail;
  /** Refetch the project detail, so every surface reading it stays in step. */
  onRefresh: () => void;
  projectId: string;
}

const ProjectResources = memo<ProjectResourcesProps>(({ detail, onRefresh, projectId }) => {
  const { t } = useTranslation('project');
  const navigate = useWorkspaceAwareNavigate();
  // One row is enough to hold the page: a second removal would race the first
  // onto the same project row, and the detail refetch that follows resolves
  // both anyway.
  const [busyId, setBusyId] = useState<string | null>(null);

  const links = useMemo<ProjectResourceLink[]>(
    () => detail.knowledgeBases ?? [],
    [detail.knowledgeBases],
  );

  const linkedIds = useMemo(() => new Set(links.map((link) => link.knowledgeBase.id)), [links]);

  const handleAdd = useCallback(() => {
    openAddResourceModal({ linkedIds, onAdded: onRefresh, projectId });
  }, [linkedIds, onRefresh, projectId]);

  const handleOpen = useCallback(
    (knowledgeBaseId: string) => {
      navigate(getProjectLibraryPath(projectId, knowledgeBaseId));
    },
    [navigate, projectId],
  );

  const handleRemove = useCallback(
    (knowledgeBaseId: string, name: string) => {
      confirmModal({
        content: t('resources.removeConfirm.content', { name }),
        okButtonProps: { danger: true },
        okText: t('resources.removeConfirm.ok'),
        onOk: async () => {
          setBusyId(knowledgeBaseId);
          try {
            await projectService.removeKnowledgeBase(projectId, knowledgeBaseId);
            onRefresh();
          } catch {
            toast.error(t('resources.removeError'));
          } finally {
            setBusyId(null);
          }
        },
        title: t('resources.removeConfirm.title'),
      });
    },
    [onRefresh, projectId, t],
  );

  return (
    <div className="flex w-full flex-col gap-5 p-6">
      <div className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xl font-semibold">{t('resources.title')}</span>
          <span className="text-sm text-muted-foreground">{t('resources.description')}</span>
        </div>
        <Button
          multiline
          className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 max-w-full [overflow-wrap:anywhere]"
          size="compact"
          variant="default"
          onClick={handleAdd}
        >
          {createElement(Plus, { 'size': 16, 'aria-hidden': true })}
          {t('resources.add')}
        </Button>
      </div>
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10">
          <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
            {createElement(BookOpen, { 'size': 40, 'aria-hidden': true })}
            <div>
              {
                <div className="flex flex-col gap-1">
                  <span className="text-sm">{t('resources.empty.title')}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('resources.empty.description')}
                  </span>
                </div>
              }
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {links.map((link) => {
            const { binding, knowledgeBase } = link;
            const busy = busyId === knowledgeBase.id;

            return (
              <div
                className={cn('flex flex-row flex-wrap items-center gap-3', styles.card)}
                key={binding.id}
              >
                <span className={styles.icon}>
                  <LibraryBigIcon size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-row items-center gap-2">
                    <span className="truncate text-sm font-medium">{knowledgeBase.name}</span>
                    {!binding.enabled && (
                      <Badge variant="secondary">{t('resources.disabled')}</Badge>
                    )}
                  </div>
                  {knowledgeBase.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {knowledgeBase.description}
                    </span>
                  )}
                </div>
                <Button
                  multiline
                  className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 max-w-full [overflow-wrap:anywhere]"
                  size="compact"
                  variant="ghost"
                  onClick={() => handleOpen(knowledgeBase.id)}
                >
                  {t('resources.open')}
                </Button>
                <Button
                  multiline
                  aria-busy={busy}
                  className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 max-w-full [overflow-wrap:anywhere]"
                  disabled={busy || busy}
                  size="compact"
                  variant="destructive"
                  onClick={() => handleRemove(knowledgeBase.id, knowledgeBase.name)}
                >
                  {createElement(Unlink, { 'size': 16, 'aria-hidden': true })}
                  {busy && <Spinner />}
                  {t('resources.remove')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

ProjectResources.displayName = 'ProjectResources';

export default ProjectResources;
