import { memo } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { lambdaQuery } from '@/libs/trpc/client';

import SkeletonLoading from '../Loading';
import ChunkItem from './ChunkItem';

interface ChunkListProps {
  fileId: string;
}
const ChunkList = memo<ChunkListProps>(({ fileId }) => {
  const { data, isLoading, fetchNextPage } = lambdaQuery.chunk.getChunksByFileId.useInfiniteQuery(
    { id: fileId },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const dataSource = data?.pages.flatMap((page) => page.items) || [];

  return isLoading ? (
    <SkeletonLoading />
  ) : (
    <div className="flex flex-col flex-1">
      <Virtuoso
        data={dataSource}
        endReached={() => {
          fetchNextPage();
        }}
        itemContent={(index, item) => (
          <div className="flex flex-col px-3" key={item.id}>
            <ChunkItem {...item} index={index} />
          </div>
        )}
      />
    </div>
  );
});

export default ChunkList;
