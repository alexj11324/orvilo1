import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { useFileStore } from '@/store/file';

import SkeletonLoading from '../Loading';
import ChunkItem from './Item';

const SimilaritySearchList = memo(() => {
  const isSimilaritySearching = useFileStore((s) => s.isSimilaritySearching);
  const dataSource = useFileStore((s) => s.similaritySearchChunks, isEqual);

  return isSimilaritySearching ? (
    <SkeletonLoading />
  ) : (
    <div className="flex flex-col flex-1">
      <Virtuoso
        data={dataSource}
        itemContent={(index, item) => (
          <div className="flex flex-col px-3" key={item.id}>
            <ChunkItem {...item} index={index} />
          </div>
        )}
      />
    </div>
  );
});

export default SimilaritySearchList;
