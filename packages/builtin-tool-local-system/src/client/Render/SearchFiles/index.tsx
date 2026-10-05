import type { SearchFilesState } from '@orvilo/tool-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import SearchResult from './Result';
import SearchQuery from './SearchQuery';

const SearchFiles = memo<BuiltinRenderProps<any, SearchFilesState>>(
  ({ messageId, pluginError, args, pluginState }) => {
    return (
      <div className="flex flex-col gap-1">
        <SearchQuery args={args} messageId={messageId} pluginState={pluginState} />
        <SearchResult
          messageId={messageId}
          pluginError={pluginError}
          searchResults={pluginState?.results}
        />
      </div>
    );
  },
);

SearchFiles.displayName = 'SearchFiles';

export default SearchFiles;
