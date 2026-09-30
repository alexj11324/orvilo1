'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useCreateNewModal } from '@/features/LibraryModal';
import EmptyNavItem from '@/features/NavPanel/components/EmptyNavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useKnowledgeBaseStore } from '@/store/library';
import { getLibraryListAsyncState } from '@/utils/libraryListAsyncState';

import Item from './Item';

/**
 * Show library list in the sidebar
 */
const LibraryList = memo(() => {
  const { t } = useTranslation('file');
  // Mirrors the file-explorer mode: `private` → only own private KBs,
  // `workspace` → only public KBs. Personal-mode users never render this list
  // with a filter (the toggle isn't shown), so `visibility` stays undefined
  // and the query returns everything the ownership predicate allows.
  const listVisibility = useResourceManagerStore((s) => s.listVisibility);
  const visibility = listVisibility === 'private' ? ('private' as const) : ('public' as const);

  const useFetchKnowledgeBaseList = useKnowledgeBaseStore((s) => s.useFetchKnowledgeBaseList);
  // `isValidating` catches the first fetch after switching mode — SWR's key
  // has no cache yet, and because `useFetchKnowledgeBaseList` sets
  // `fallbackData: []`, `isLoading` collapses to false immediately. Without
  // this, the sidebar flashes the empty state for the network round-trip
  // before the real list arrives.
  // `fallbackData: []` keeps `data` an array even on failure, so a failed KB-list
  // fetch used to render the "create your first library" empty (Read §1.1
  // failure-as-empty). Read `error` / `mutate` and branch the failure before empty.
  const { data, isLoading, isValidating, error, mutate } = useFetchKnowledgeBaseList(visibility);

  const navigate = useWorkspaceAwareNavigate();

  const { open } = useCreateNewModal();
  const { allowed: canCreate } = usePermission('create_content');

  const handleCreate = () => {
    if (!canCreate) return;
    open({
      onSuccess: (id) => {
        navigate(`/resource/library/${id}`);
      },
    });
  };

  const {
    boundaryData,
    isEmpty,
    isLoading: showSkeleton,
  } = getLibraryListAsyncState({ data, isLoading, isValidating });

  return (
    <AsyncBoundary
      data={boundaryData}
      error={error}
      errorVariant={'inline'}
      isEmpty={isEmpty}
      isLoading={showSkeleton}
      loading={<SkeletonList className="px-1" rows={3} />}
      empty={
        <EmptyNavItem
          disabled={!canCreate}
          title={t(
            listVisibility === 'private' ? 'library.privateEmpty' : 'library.workspaceEmpty',
          )}
          onClick={handleCreate}
        />
      }
      onRetry={() => mutate()}
    >
      <div className="flex flex-col gap-[1px] px-1">
        {data?.map((item) => (
          <Item
            description={item.description}
            id={item.id}
            key={item.id}
            memberRestricted={(item as { memberRestricted?: boolean }).memberRestricted}
            name={item.name}
            permissionManageable={(item as { permissionManageable?: boolean }).permissionManageable}
            userId={item.userId}
            visibility={item.visibility}
          />
        ))}
      </div>
    </AsyncBoundary>
  );
});

export default LibraryList;
