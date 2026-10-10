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
  card: 'rounded-[12px] border border-sidebar-border bg-[color-mix(in_srgb,var(--card)_82%,var(--ant-color-fill-quaternary))] px-3.5 py-3 hover:border-border', // linear-token-override: preserve the existing resource surface radius during this style-only migration; geometry is not redesigned here.
  icon: 'flex size-9 flex-none items-center justify-center rounded-[10px] bg-[var(--ant-color-fill-quaternary)] text-primary', // linear-token-override: preserve the existing resource surface radius during this style-only migration; geometry is not redesigned here.
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
    <div
      className="flex flex-col"
      style={{ gap: 20, padding: 24, marginInline: 'auto', maxWidth: 840, width: '100%' }}
    >
      <div
        className="flex flex-row"
        style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}
      >
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span className="text-sm" style={{ fontSize: 18, fontWeight: 600 }}>
            {t('resources.title')}
          </span>
          <span className="text-sm text-muted-foreground">{t('resources.description')}</span>
        </div>
        <Button variant="default" onClick={handleAdd}>
          {createElement(Plus, { 'size': 16, 'aria-hidden': true })}
          {t('resources.add')}
        </Button>
      </div>
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ padding: 40 }}>
          <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
            {createElement(BookOpen, { 'size': 40, 'aria-hidden': true })}
            <div>
              {
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <span className="text-sm">{t('resources.empty.title')}</span>
                  <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
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
                className={cn('flex flex-row', styles.card)}
                key={binding.id}
                style={{ alignItems: 'center', gap: 12 }}
              >
                <span className={styles.icon}>
                  <LibraryBigIcon size={18} />
                </span>
                <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <div className="flex flex-row" style={{ alignItems: 'center', gap: 8 }}>
                    <span className="text-sm truncate" style={{ fontWeight: 500 }}>
                      {knowledgeBase.name}
                    </span>
                    {!binding.enabled && (
                      <Badge variant="secondary">{t('resources.disabled')}</Badge>
                    )}
                  </div>
                  {knowledgeBase.description && (
                    <span
                      className="text-sm text-muted-foreground truncate"
                      style={{ fontSize: 12 }}
                    >
                      {knowledgeBase.description}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleOpen(knowledgeBase.id)}>
                  {t('resources.open')}
                </Button>
                <Button
                  aria-busy={busy}
                  disabled={busy || busy}
                  size="sm"
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
