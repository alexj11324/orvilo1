import { memo } from 'react';

import SearchBar from '@/components/SearchBar';
import { useFileStore } from '@/store/file';
import { fileChunkSelectors } from '@/store/file/slices/chunk';

import ChunkList from './ChunkList';
import SimilaritySearchList from './SimilaritySearchList';

const Content = memo(() => {
  const [fileId, showSimilaritySearch, semanticSearch] = useFileStore((s) => [
    fileChunkSelectors.enabledChunkFileId(s),
    fileChunkSelectors.showSimilaritySearchResult(s),
    s.semanticSearch,
  ]);

  if (!fileId) return;

  return (
    <div className="flex flex-col gap-2 h-[100%]" style={{ paddingBlock: '16px 0' }}>
      <div className="flex flex-col px-3">
        <SearchBar
          onChange={(text) => {
            if (!text) useFileStore.setState({ isSimilaritySearch: false });
          }}
          onSearch={async (text) => {
            useFileStore.setState({ isSimilaritySearch: !!text });
            semanticSearch(text, fileId);
          }}
        />
      </div>
      {showSimilaritySearch ? <SimilaritySearchList /> : <ChunkList fileId={fileId} />}
    </div>
  );
});

export default Content;
