'use client';

import { PlusIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import LibraryStatusIcon from '@/components/LibIcon/StatusIcon';
import {
  RESOURCE_HOME_SECTIONS,
  ResourceSectionSkeleton,
} from '@/components/Skeleton/ResourceHome';
import { useCreateNewModal } from '@/features/LibraryModal';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useKnowledgeBaseStore } from '@/store/library';
import { getLibraryListAsyncState } from '@/utils/libraryListAsyncState';

import SectionTitle from './SectionTitle';

const styles = {
  chip: 'cursor-pointer flex gap-2.5 items-center min-w-0 py-3.5 px-4 border border-sidebar-border rounded-(--radius-overlay) text-start bg-(--ant-color-fill-quaternary) [transition:border-color_0.2s_var(--ant-motion-ease-in-out),background-color_0.2s_var(--ant-motion-ease-in-out)] hover:border-border hover:bg-accent',
  createChip:
    'cursor-pointer flex gap-2 items-center justify-center py-3.5 px-4 border border-dashed border-border rounded-(--radius-overlay) text-muted-foreground bg-transparent [transition:border-color_0.2s_var(--ant-motion-ease-in-out),color_0.2s_var(--ant-motion-ease-in-out)] hover:border-(--ant-color-text-quaternary) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
  grid: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3',
  name: 'truncate text-[13px] font-medium text-foreground',
};

/**
 * How many libraries the quick-access row shows. The list is ordered by last
 * update, so this is "the ones you are working in"; the sidebar stays the full
 * index, which is why the home page must not repeat every library here.
 */
const MAX_LIBRARIES = 9;

/**
 * Quick access to the user's libraries — the everyday entry point of the
 * library home, and the page's only library list.
 */
const Libraries = memo(() => {
  const { t } = useTranslation('file');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canCreate } = usePermission('create_content');

  const listVisibility = useResourceManagerStore((s) => s.listVisibility);
  const visibility = listVisibility === 'private' ? ('private' as const) : ('public' as const);

  const useFetchKnowledgeBaseList = useKnowledgeBaseStore((s) => s.useFetchKnowledgeBaseList);
  const { data, error, isLoading, isValidating, mutate } = useFetchKnowledgeBaseList(visibility);
  // The hook uses fallbackData: []; for a new workspace/visibility key SWR therefore
  // reports isLoading=false while the request is still validating.
  const { isLoading: showSkeleton } = getLibraryListAsyncState({
    data,
    isLoading,
    isValidating,
  });

  const setLibraryId = useResourceManagerStore((s) => s.setLibraryId);
  const { open: openCreateLibrary } = useCreateNewModal();

  const handleCreate = () => {
    if (!canCreate) return;
    openCreateLibrary({
      onSuccess: (id) => {
        navigate(`/resource/library/${id}`);
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle title={t('home.libraries')} />
      {error && !data?.length ? (
        <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} />
      ) : showSkeleton ? (
        <ResourceSectionSkeleton {...RESOURCE_HOME_SECTIONS.libraries} />
      ) : (
        <div className={styles.grid}>
          {data?.slice(0, MAX_LIBRARIES).map((item) => (
            <button
              className={styles.chip}
              key={item.id}
              type={'button'}
              onClick={() => {
                setLibraryId(item.id);
                navigate(`/resource/library/${item.id}`);
              }}
            >
              <LibraryStatusIcon
                memberRestricted={(item as { memberRestricted?: boolean }).memberRestricted}
                size={18}
                visibility={item.visibility}
              />
              <span className={styles.name}>{item.name}</span>
            </button>
          ))}
          <button
            className={styles.createChip}
            disabled={!canCreate}
            type={'button'}
            onClick={handleCreate}
          >
            <span className="anticon" role="img">
              <PlusIcon fill={'transparent'} height={16} size={16} width={16} />
            </span>
            {t('home.uploadEntries.library.title')}
          </button>
        </div>
      )}
    </div>
  );
});

Libraries.displayName = 'Libraries';

export default Libraries;
