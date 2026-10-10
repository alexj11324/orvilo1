import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { Skeleton } from '@/components/ui/skeleton';
import { useFolderPath } from '@/features/ResourceManager/hooks/useFolderPath';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFileStore } from '@/store/file';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';
import { FilesTabs } from '@/types/files';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

interface BreadcrumbProps {
  category?: string;
  fileName?: string;
  knowledgeBaseId?: string;
}

interface FolderCrumb {
  id: string;
  name: string;
  slug: string;
}

const Breadcrumb = memo<BreadcrumbProps>(({ category, fileName }) => {
  const { t } = useTranslation('file');
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams] = useSearchParams();
  const { currentFolderSlug, knowledgeBaseId: currentKnowledgeBaseId } = useFolderPath();

  const setMode = useResourceManagerStore((s) => s.setMode);
  const setCurrentViewItemId = useResourceManagerStore((s) => s.setCurrentViewItemId);

  const baseKnowledgeBaseId = currentKnowledgeBaseId;
  const knowledgeBaseName = useKnowledgeBaseStore(
    knowledgeBaseSelectors.getKnowledgeBaseNameById(baseKnowledgeBaseId || ''),
  );

  // Fetch folder breadcrumb chain from backend
  const useFetchFolderBreadcrumb = useFileStore((s) => s.useFetchFolderBreadcrumb);
  const { data: folderChain = [] } = useFetchFolderBreadcrumb(currentFolderSlug);

  // When in inbox mode (no knowledgeBaseId), show category in breadcrumb
  if (!baseKnowledgeBaseId) {
    if (!category || category === FilesTabs.All) {
      return null;
    }

    const categoryLabel = t(`tab.${category as FilesTabs}` as any);

    return (
      <div
        className={cn(
          'flex flex-row items-center gap-0',
          'text-sm leading-5.5 text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'cursor-pointer transition-colors duration-(--orvilo-motion-slow) ease-[ease] hover:text-foreground',
            'font-medium text-foreground',
            'cursor-default',
          )}
        >
          {categoryLabel}
        </span>
      </div>
    );
  }

  const handleNavigate = (slug: string | null) => {
    // If navigating while viewing a file, reset the file view mode
    if (fileName) {
      setMode('explorer');
      setCurrentViewItemId(undefined);
    }

    // Preserve existing query parameters (view and sort preferences)
    const newParams = new URLSearchParams(searchParams);
    // Remove 'file' parameter when navigating away
    newParams.delete('file');

    const queryString = newParams.toString();
    const basePath = slug
      ? `/resource/library/${baseKnowledgeBaseId}/${slug}`
      : `/resource/library/${baseKnowledgeBaseId}`;

    navigate(queryString ? `${basePath}?${queryString}` : basePath);
  };

  const isAtRoot = folderChain.length === 0 && !fileName;
  const isRootClickable = folderChain.length > 0 || fileName;

  return (
    <div
      className={cn(
        'flex flex-row items-center gap-0',
        'text-sm leading-5.5 text-muted-foreground',
      )}
    >
      <span
        {...clickableProps()}
        style={{ cursor: isRootClickable ? 'pointer' : 'default' }}
        className={cn(
          cn(
            'cursor-pointer transition-colors duration-(--orvilo-motion-slow) ease-[ease] hover:text-foreground',
            isAtRoot && 'font-medium text-foreground',
          ),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={() => isRootClickable && handleNavigate(null)}
      >
        {knowledgeBaseName || <Skeleton className="h-3.5 min-w-20 w-20" />}
      </span>

      {folderChain.map((folder: FolderCrumb, index: number) => {
        const isLast = index === folderChain.length - 1 && !fileName;
        return (
          <div className="flex flex-row items-center gap-0" key={folder.id}>
            <span className="mx-2 text-foreground-quaternary">/</span>
            <span
              {...clickableProps()}
              style={{ cursor: isLast ? 'default' : 'pointer' }}
              className={cn(
                cn(
                  'cursor-pointer transition-colors duration-(--orvilo-motion-slow) ease-[ease] hover:text-foreground',
                  isLast && 'font-medium text-foreground',
                ),
                CLICKABLE_FOCUS_RING,
              )}
              onClick={() => !isLast && handleNavigate(folder.slug)}
            >
              {folder.name}
            </span>
          </div>
        );
      })}

      {fileName && (
        <div className="flex flex-row items-center gap-0">
          <span className="mx-2 text-foreground-quaternary">/</span>
          <span
            className={cn(
              'cursor-pointer transition-colors duration-(--orvilo-motion-slow) ease-[ease] hover:text-foreground',
              'font-medium text-foreground',
              'cursor-default',
            )}
          >
            {fileName}
          </span>
        </div>
      )}
    </div>
  );
});

Breadcrumb.displayName = 'Breadcrumb';

export default Breadcrumb;
