'use client';
import { t as translate } from 'i18next';
import { BookOpen, LibraryBigIcon } from 'lucide-react';
import { createElement, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, type ModalInstance } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { projectService } from '@/services/project';
import { useKnowledgeBaseStore } from '@/store/library';
import { getLibraryListAsyncState } from '@/utils/libraryListAsyncState';

const styles = {
  row: 'flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-[var(--ant-color-fill-quaternary)]', // linear-token-override: preserve the existing resource surface radius during this style-only migration; geometry is not redesigned here.
};

interface AddResourceContentProps {
  /** Libraries the project already references — shown as taken, not hidden. */
  linkedIds: Set<string>;
  onAdded: () => void;
  projectId: string;
}

export const AddResourceContent = memo<AddResourceContentProps>(
  ({ linkedIds, onAdded, projectId }) => {
    const { t } = useTranslation('project');
    const useFetchKnowledgeBaseList = useKnowledgeBaseStore((s) => s.useFetchKnowledgeBaseList);
    const { data, isLoading, isValidating } = useFetchKnowledgeBaseList();
    // A library added in this session keeps its "added" state locally too, so the
    // row does not flicker back to actionable while the project detail refetches.
    const [justAdded, setJustAdded] = useState<Set<string>>(() => new Set());
    const [pendingId, setPendingId] = useState<string | null>(null);

    const handleAdd = useCallback(
      async (knowledgeBaseId: string) => {
        setPendingId(knowledgeBaseId);
        try {
          await projectService.addKnowledgeBase(projectId, knowledgeBaseId);
          setJustAdded((previous) => new Set(previous).add(knowledgeBaseId));
          onAdded();
        } catch {
          toast.error(t('resources.addError'));
        } finally {
          setPendingId(null);
        }
      },
      [onAdded, projectId, t],
    );

    // The store's SWR carries `fallbackData: []`, so `isLoading` alone is false
    // during the first fetch and an `isEmpty` check on it would claim the reader
    // has no libraries for as long as the request takes. The shared derivation
    // counts in-flight validation over empty data as unsettled instead.
    const { isEmpty, isLoading: showSkeleton } = getLibraryListAsyncState({
      data,
      isLoading,
      isValidating,
    });

    if (showSkeleton)
      return (
        <div className="flex flex-col">
          <div aria-busy="true" className="flex flex-col gap-2" role="status">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-4 w-full" key={index} />
            ))}
          </div>
        </div>
      );

    if (isEmpty)
      return (
        <div className="flex flex-col items-center justify-center" style={{ padding: 32 }}>
          <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
            {createElement(BookOpen, { 'size': 40, 'aria-hidden': true })}
            <div>{t('resources.addModal.empty')}</div>
          </div>
        </div>
      );

    return (
      <div className="flex flex-col" style={{ gap: 2, maxHeight: 420, overflowY: 'auto' }}>
        {(data ?? []).map((library) => {
          const linked = linkedIds.has(library.id) || justAdded.has(library.id);

          return (
            <div className={styles.row} key={library.id}>
              <LibraryBigIcon size={18} />
              <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span className="text-sm truncate" style={{ fontWeight: 500 }}>
                  {library.name}
                </span>
                {library.description && (
                  <span className="text-sm text-muted-foreground truncate" style={{ fontSize: 12 }}>
                    {library.description}
                  </span>
                )}
              </div>
              {linked ? (
                <Badge variant="secondary">{t('resources.addModal.added')}</Badge>
              ) : (
                <Button
                  aria-busy={pendingId === library.id}
                  disabled={pendingId === library.id}
                  size="sm"
                  variant="outline"
                  onClick={() => handleAdd(library.id)}
                >
                  {pendingId === library.id && <Spinner />}
                  {t('resources.add')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

AddResourceContent.displayName = 'AddResourceContent';

type OpenAddResourceModalOptions = AddResourceContentProps;

/**
 * Picks a library to reference from the project. The modal stays open after an
 * add so several libraries can be attached in one pass — the project page
 * behind it refreshes on each one.
 */
export const openAddResourceModal = ({
  linkedIds,
  onAdded,
  projectId,
}: OpenAddResourceModalOptions): ModalInstance =>
  createModal({
    content: <AddResourceContent linkedIds={linkedIds} projectId={projectId} onAdded={onAdded} />,
    footer: false,
    styles: { content: { overflow: 'hidden' } },
    title: translate('resources.addModal.title', { ns: 'project' }),
    width: 520,
  });
