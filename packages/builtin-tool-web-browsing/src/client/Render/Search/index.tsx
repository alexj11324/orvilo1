import { Alert } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps, SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { memo, useState } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import ConfigForm from './ConfigForm';
import SearchQueryView from './SearchQuery';
import SearchResult from './SearchResult';

const Search = memo<BuiltinRenderProps<SearchQuery, UniformSearchResponse>>(
  ({ messageId, args: searchQuery, pluginState: searchResponse, pluginError }) => {
    const [editing, setEditing] = useState(false);

    if (pluginError) {
      if (pluginError?.type === 'PluginSettingsInvalid') {
        return <ConfigForm id={messageId} provider={pluginError.body?.provider} />;
      }

      return (
        <Alert
          title={pluginError?.message}
          type={'error'}
          extra={
            <div className="flex flex-col">
              <CodeBlock
                actionIconSize={'small'}
                code={JSON.stringify(pluginError.body?.data || pluginError.body, null, 2)}
                language={'json'}
                variant={'ghost'}
              />
            </div>
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <SearchQueryView
          args={searchQuery}
          editing={editing}
          messageId={messageId}
          pluginState={searchResponse}
          setEditing={setEditing}
        />
        <SearchResult
          args={searchQuery}
          editing={editing}
          messageId={messageId}
          pluginState={searchResponse}
          setEditing={setEditing}
        />
      </div>
    );
  },
);

export default Search;
