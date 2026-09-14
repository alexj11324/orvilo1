import type { ListFilesState } from '@orvilo/tool-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import SearchResult from './Result';

const ListFiles = memo<BuiltinRenderProps<any, ListFilesState>>(
  ({ messageId, pluginError, pluginState }) => {
    return (
      <SearchResult
        listResults={pluginState?.files}
        messageId={messageId}
        pluginError={pluginError}
      />
    );
  },
);

ListFiles.displayName = 'ListFiles';

export default ListFiles;
