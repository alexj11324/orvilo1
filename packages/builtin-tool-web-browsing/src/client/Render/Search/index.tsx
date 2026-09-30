import type { BuiltinRenderProps, SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { CircleAlert } from 'lucide-react';
import { memo, useState } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';

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
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{pluginError?.message}</AlertTitle>
          <AlertAction>
            {
              <div className="flex flex-col">
                <CodeBlock
                  code={JSON.stringify(pluginError.body?.data || pluginError.body, null, 2)}
                  language={'json'}
                  variant={'ghost'}
                />
              </div>
            }
          </AlertAction>
        </Alert>
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
