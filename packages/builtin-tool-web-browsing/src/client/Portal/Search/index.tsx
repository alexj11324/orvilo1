import type { SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { uniq } from 'es-toolkit/compat';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useChatStore } from '@/store/chat';
import { chatToolSelectors } from '@/store/chat/selectors';

import SearchBar from '../../components/SearchBar';
import ResultList from './ResultList';

interface InspectorUIProps {
  messageId: string;
  query: SearchQuery;
  response: UniformSearchResponse;
}

const Inspector = memo<InspectorUIProps>(({ query: args, messageId, response }) => {
  const engines = uniq((response.results || []).flatMap((result) => result.engines));
  const defaultEngines = engines.length > 0 ? engines : args?.searchEngines || [];
  const loading = useChatStore(chatToolSelectors.isSearXNGSearching(messageId));

  if (loading) {
    return (
      <div className="flex flex-col gap-3 h-[100%]">
        <SearchBar
          aiSummary={false}
          defaultEngines={defaultEngines}
          defaultQuery={args.query}
          messageId={messageId}
          tooltip={false}
        />

        <div className="flex flex-col gap-4 py-4 px-3">
          {[1, 2, 3, 4, 6].map((id) => (
            <div className="flex flex-col gap-2" key={id}>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4" style={{ width: `${(id % 4) + 5}0%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-[100%]">
      <SearchBar
        aiSummary={false}
        defaultEngines={defaultEngines}
        defaultQuery={args.query}
        messageId={messageId}
        tooltip={false}
      />
      <div className="flex flex-col h-[100%] w-[100%]">
        <ResultList dataSources={response.results} />
      </div>
    </div>
  );
});

export default Inspector;
