'use client';

import { VirtuosoMasonry } from '@virtuoso.dev/masonry';
import { cn } from 'cn';
import { type UIEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { sortFileList } from '@/features/ResourceManager/store/selectors';
import { useFileStore } from '@/store/file';
import { type FileListItem } from '@/types/files';
import type { ResourceQueryParams } from '@/types/resource';

import {
  useExplorerSelectionActions,
  useExplorerSelectionSummary,
} from '../hooks/useExplorerSelection';
import { isQueryNavigation } from '../isQueryNavigation';
import SourceFilter from '../ToolBar/SourceFilter';
import { useMasonryColumnCount } from '../useMasonryColumnCount';
import MasonryItemWrapper from './MasonryItem/MasonryItemWrapper';
import MasonryViewSkeleton from './Skeleton';
import { useMasonryViewState } from './useMasonryViewState';

const styles = {
  stickyHeader: 'sticky z-1 inset-bs-0 bg-card',
  selectAllHint:
    'py-2 px-1 [border-block-end:1px_solid_var(--sidebar-border)] text-xs text-foreground-description bg-accent',
  toolbar: 'py-3 px-1 [border-block-end:1px_solid_var(--sidebar-border)] bg-card',
};

interface MasonryViewProps {
  isLoading?: boolean;
  isValidating?: boolean;
  queryParams: ResourceQueryParams;
}

const MasonryView = memo(function MasonryView({
  isLoading,
  isValidating,
  queryParams,
}: MasonryViewProps) {
  // Access all state from Resource Manager store
  const [libraryId, viewMode, sorter, sortType] = useResourceManagerStore((s) => [
    s.libraryId,
    s.viewMode,
    s.sorter,
    s.sortType,
  ]);

  const { t } = useTranslation(['components', 'file']);
  const columnCount = useMasonryColumnCount();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // NEW: Read from resource store instead of fetching independently
  const resourceList = useFileStore((s) => s.resourceList);
  const resourceTotal = useFileStore((s) => s.total);

  const { queryParams: currentQueryParams, hasMore, loadMoreResources } = useFileStore();

  const isNavigating = useMemo(
    () => isQueryNavigation(currentQueryParams, queryParams),
    [currentQueryParams, queryParams],
  );

  // Map ResourceItem[] to FileListItem[] for compatibility
  // Spread `item` first so file-backed fields (e.g. `fileId`) are preserved —
  // chunk actions need `fileId` to resolve `docs_*` ids to `file_*` ids (#16267).
  const rawData = useMemo(
    () =>
      resourceList?.map((item): FileListItem => ({
        ...item,
        chunkCount: item.chunkCount ?? null,
        chunkingError: item.chunkingError ?? null,
        chunkingStatus: (item.chunkingStatus as any) ?? null,
        embeddingError: item.embeddingError ?? null,
        embeddingStatus: (item.embeddingStatus as any) ?? null,
        finishEmbedding: item.finishEmbedding ?? false,
        url: item.url ?? '',
      })) ?? [],
    [resourceList],
  );

  // Sort data using current sort settings
  const data = useMemo(
    () => sortFileList(rawData, sorter, sortType) || [],
    [rawData, sorter, sortType],
  );

  const dataLength = data.length;
  const effectiveIsLoading = isLoading ?? false;
  const effectiveIsNavigating = isNavigating ?? false;
  const effectiveIsValidating = isValidating ?? false;
  const { isMasonryReady, showSkeleton } = useMasonryViewState({
    dataLength,
    isLoading: effectiveIsLoading,
    isNavigating: effectiveIsNavigating,
    isValidating: effectiveIsValidating,
    viewMode,
  });
  const {
    handleSelectAll,
    handleSelectAllResources,
    isItemSelectable,
    selectAllState,
    selectedFileIds,
    toggleItemSelection,
  } = useExplorerSelectionActions(data);
  const {
    allSelected,
    hasSelectableItems,
    indeterminate,
    selectableCount,
    selectedCount,
    showSelectAllHint,
    total,
  } = useExplorerSelectionSummary({
    data,
    hasMore,
  });
  const isAllResultsSelected = selectAllState === 'all' && total === selectedCount;
  const handleSelectAllResults = useCallback(
    (checked?: boolean) => {
      if (checked !== false && !hasMore) {
        void handleSelectAllResources();
        return;
      }

      handleSelectAll(checked);
    },
    [handleSelectAll, handleSelectAllResources, hasMore],
  );

  // Handle automatic load more when scrolling to bottom
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      await loadMoreResources();
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, loadMoreResources]);

  const handleSelectionChange = useCallback(
    (id: string, checked: boolean) => {
      toggleItemSelection(id, checked);
    },
    [toggleItemSelection],
  );

  const masonryContext = useMemo(
    () => ({
      knowledgeBaseId: libraryId,
      isItemSelectable,
      onSelectedChange: handleSelectionChange,
      selectAllState,
      selectFileIds: selectedFileIds,
    }),
    [handleSelectionChange, isItemSelectable, libraryId, selectAllState, selectedFileIds],
  );

  // Handle scroll event to detect when near bottom
  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;

      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      // Trigger load when within 300px of bottom
      if (scrollHeight - scrollTop - clientHeight < 300) {
        handleLoadMore();
      }
    },
    [handleLoadMore],
  );

  return showSkeleton ? (
    <MasonryViewSkeleton columnCount={columnCount} />
  ) : (
    <div
      className="flex h-full min-h-0 flex-1 flex-col transition-opacity duration-200 ease-in-out motion-reduce:transition-none"
      style={{ opacity: isMasonryReady ? 1 : 0 }}
    >
      <div className="flex min-h-0 flex-1 flex-col pbs-3 pbe-6 px-6">
        <div className={cn('shrink-0', styles.stickyHeader)}>
          <div className={cn('flex flex-row items-center gap-2', styles.toolbar)}>
            <Checkbox
              checked={allSelected}
              disabled={!hasSelectableItems}
              indeterminate={indeterminate}
              onCheckedChange={handleSelectAllResults}
            />
            <span>
              {selectedCount > 0 || selectAllState === 'all'
                ? t(
                    selectAllState === 'all'
                      ? total
                        ? isAllResultsSelected
                          ? 'FileManager.total.allSelectedCount'
                          : 'FileManager.total.selectedCount'
                        : 'FileManager.total.allSelectedFallback'
                      : 'FileManager.total.selectedCount',
                    {
                      count: selectedCount,
                      ns: 'components',
                    },
                  )
                : t('FileManager.total.fileCount', {
                    count: resourceTotal || dataLength,
                    ns: 'components',
                  })}
            </span>
            <div className="flex flex-col flex-1" />
            <SourceFilter />
          </div>
          {showSelectAllHint && (
            <div
              className={cn(
                'flex flex-row items-center gap-1.5 px-1 flex-wrap',
                styles.selectAllHint,
              )}
            >
              <span>
                {t(
                  selectAllState === 'all'
                    ? total
                      ? isAllResultsSelected
                        ? 'FileManager.total.allSelectedCount'
                        : 'FileManager.total.selectedCount'
                      : 'FileManager.total.allSelectedFallback'
                    : 'FileManager.total.loadedSelectedCount',
                  {
                    count: selectedCount,
                    ns: 'components',
                  },
                )}
              </span>
              {selectAllState !== 'all' && (
                <Button size="sm" variant="link" onClick={handleSelectAllResources}>
                  {total && total > selectableCount
                    ? t('FileManager.total.selectAll', {
                        count: total,
                        ns: 'components',
                      })
                    : t('FileManager.total.selectAllFallback', {
                        ns: 'components',
                      })}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <VirtuosoMasonry
            ItemContent={MasonryItemWrapper}
            className="min-h-0 flex-1 gap-4"
            columnCount={columnCount}
            context={masonryContext}
            data={data}
            footer={
              isLoadingMore ? (
                <div className="flex min-h-10 flex-none flex-col items-center justify-center text-sm text-muted-foreground">
                  {t('loading', { defaultValue: 'Loading...' })}
                </div>
              ) : null
            }
            onScrollCapture={handleScroll}
          />
        </div>
      </div>
    </div>
  );
});

export default MasonryView;
