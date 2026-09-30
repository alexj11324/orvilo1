'use client';

import { useRef } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import type { ResourceQueryParams } from '@/types/resource';

import ListViewDropZone from './ListViewDropZone';
import ListViewHeader from './ListViewHeader';
import ListViewSkeleton from './Skeleton';
import { styles } from './styles';
import { useExplorerListData } from './useExplorerListData';
import VirtualizedFileList from './VirtualizedFileList';

interface ListViewProps {
  isLoading?: boolean;
  isValidating?: boolean;
  queryParams: ResourceQueryParams;
}

const ListView = ({ isLoading, isValidating, queryParams }: ListViewProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { columnWidths, currentFolderId, data, hasMore, showSkeleton } = useExplorerListData({
    isLoading,
    isValidating,
    queryParams,
  });
  // Personal account has only one uploader (the user themselves), so hide the
  // column entirely there — it only makes sense in a workspace with multiple members.
  const activeWorkspaceId = useActiveWorkspaceId();
  const showUploader = !!activeWorkspaceId && queryParams.visibility !== 'private';

  if (showSkeleton)
    return <ListViewSkeleton columnWidths={columnWidths} showUploader={showUploader} />;

  return (
    <div className="flex flex-col h-[100%]">
      <div className={styles.scrollContainer}>
        <ListViewHeader
          columnWidths={columnWidths}
          data={data}
          hasMore={hasMore}
          showUploader={showUploader}
        />
        <ListViewDropZone currentFolderId={currentFolderId} virtuosoRef={virtuosoRef}>
          <VirtualizedFileList
            columnWidths={columnWidths}
            data={data}
            hasMore={hasMore}
            showUploader={showUploader}
            virtuosoRef={virtuosoRef}
          />
        </ListViewDropZone>
      </div>
    </div>
  );
};

export default ListView;
