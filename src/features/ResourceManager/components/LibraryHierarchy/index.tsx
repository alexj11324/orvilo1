'use client';

import { cssVar } from 'antd-style';
import { FolderPlusIcon } from 'lucide-react';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VList } from 'virtua';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useFolderPath } from '@/features/ResourceManager/hooks/useFolderPath';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useFileStore } from '@/store/file';
import { useTreeStore } from '@/store/tree';

import AddButton from '../Header/AddButton';
import { KnowledgeBaseListProvider } from '../KnowledgeBaseListProvider';
import { HierarchyNode } from './HierarchyNode';
import SearchResults from './SearchResults';
import { resolveHierarchySelectedKey } from './selection';
import TreeSkeleton from './TreeSkeleton';
import { buildVisibleNodes } from './visibleNodes';

const LibraryHierarchy = memo(() => {
  const { t } = useTranslation('file');
  const { currentFolderSlug } = useFolderPath();
  const [libraryId, currentViewItemId, librarySearchQuery] = useResourceManagerStore((s) => [
    s.libraryId,
    s.currentViewItemId,
    s.librarySearchQuery,
  ]);

  const children = useTreeStore((s) => s.children);
  const expanded = useTreeStore((s) => s.expanded);
  const status = useTreeStore((s) => s.status);
  const errors = useTreeStore((s) => s.errors);
  const init = useTreeStore((s) => s.init);
  const expandAncestors = useTreeStore((s) => s.expandAncestors);
  const toggle = useTreeStore((s) => s.toggle);
  const loadChildren = useTreeStore((s) => s.loadChildren);

  // Reuse Explorer Breadcrumb's SWR cache so the sidebar doesn't double-fetch
  // document.getFolderBreadcrumb when navigating into a folder.
  const useFetchFolderBreadcrumb = useFileStore((s) => s.useFetchFolderBreadcrumb);
  const { data: folderChain } = useFetchFolderBreadcrumb(currentFolderSlug);

  // Effect 1: Library switch → reset + load root
  useEffect(() => {
    if (!libraryId) return;
    init(libraryId);
  }, [libraryId, init]);

  // Effect 2: Folder navigation → expand ancestors once breadcrumb resolves
  useEffect(() => {
    if (!folderChain?.length) return;
    void expandAncestors(folderChain.map((c) => c.id));
  }, [folderChain, expandAncestors]);

  const isLoading = status[''] === 'loading';

  const visibleNodes = useMemo(() => buildVisibleNodes(children, expanded), [children, expanded]);

  const selectedKey = resolveHierarchySelectedKey({ currentFolderSlug, currentViewItemId });

  const hasData = visibleNodes.length > 0;
  // The root fetch is in flight with nothing cached yet.
  const isRootLoading = isLoading && !children[''];
  // Only genuinely empty once a library is selected and the root resolved with no rows.
  const isRootEmpty = !!libraryId && visibleNodes.length === 0;
  // A *failed* root load — previously swallowed to 'idle', which fell through to the
  // "add folder" empty (Read §1.1 failure-as-empty). Branch it before empty.
  const rootError = status[''] === 'error' ? errors[''] : undefined;

  const emptyState = (
    <div
      className="flex flex-col items-center justify-center gap-4 p-6"
      style={{ height: '100%', textAlign: 'center' }}
    >
      <span className="anticon" role="img">
        <FolderPlusIcon
          color={cssVar.colorTextQuaternary}
          fill={'transparent'}
          height={36}
          size={36}
          width={36}
        />
      </span>
      <div className="flex flex-col items-center gap-1">
        <div className="font-semibold">{t('library.hierarchy.empty.title')}</div>
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {t('library.hierarchy.empty.desc')}
        </div>
      </div>
      <AddButton />
    </div>
  );

  // A typed query swaps the tree for flat, library-scoped results. The tree
  // stays mounted underneath in store terms (children / expanded are untouched),
  // so clearing the query brings the exact same tree back.
  const hasSearchQuery = librarySearchQuery.trim().length > 0;

  return (
    <KnowledgeBaseListProvider>
      {hasSearchQuery && libraryId ? (
        <SearchResults libraryId={libraryId} query={librarySearchQuery} />
      ) : (
        <AsyncBoundary
          data={hasData ? (children[''] ?? true) : undefined}
          empty={emptyState}
          error={rootError}
          errorVariant={'block'}
          isEmpty={isRootEmpty}
          isLoading={isRootLoading}
          loading={<TreeSkeleton />}
          onRetry={() => loadChildren('')}
        >
          <div className="flex flex-col px-1" style={{ height: '100%' }}>
            <VList
              bufferSize={typeof window !== 'undefined' ? window.innerHeight : 0}
              style={{ height: '100%' }}
            >
              {visibleNodes.map(({ item, key, level, parentKey }) => (
                <div key={key} style={{ paddingBottom: 2 }}>
                  <HierarchyNode
                    isExpanded={!!expanded[item.id]}
                    isLoading={status[item.id] === 'loading'}
                    item={item}
                    level={level}
                    parentKey={parentKey}
                    selectedKey={selectedKey}
                    onToggle={toggle}
                  />
                </div>
              ))}
            </VList>
          </div>
        </AsyncBoundary>
      )}
    </KnowledgeBaseListProvider>
  );
});

LibraryHierarchy.displayName = 'FileTree';

export default LibraryHierarchy;
