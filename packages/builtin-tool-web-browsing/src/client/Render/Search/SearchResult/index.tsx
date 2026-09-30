import { Button, Skeleton } from '@lobehub/ui/base-ui';
import type { SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { uniq } from 'es-toolkit/compat';
import { Edit2Icon, SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useChatStore } from '@/store/chat';
import { chatToolSelectors } from '@/store/chat/selectors';

import SearchResultItem from './SearchResultItem';
import ShowMore from './ShowMore';

const ITEM_HEIGHT = 80;
const ITEM_WIDTH = 160;

interface SearchResultProps {
  args: SearchQuery;
  editing: boolean;
  messageId: string;
  pluginState?: UniformSearchResponse;
  setEditing: (editing: boolean) => void;
}

const SearchResult = memo<SearchResultProps>(
  ({ messageId, args, pluginState, setEditing, editing }) => {
    const loading = useChatStore(chatToolSelectors.isSearXNGSearching(messageId));
    const searchResults = pluginState?.results || [];
    const { t } = useTranslation(['tool', 'common']);

    const engines = uniq(searchResults.flatMap((result) => result.engines));
    const defaultEngines = engines.length > 0 ? engines : args?.searchEngines || [];
    const isMobile = useIsMobile();

    if (loading || !pluginState)
      return (
        <div className="flex flex-row gap-2">
          {['1', '2', '3', '4', '5'].map((id) => (
            <Skeleton height={ITEM_HEIGHT} key={id} width={ITEM_WIDTH} />
          ))}
        </div>
      );

    if (searchResults.length === 0)
      return (
        <div className="rounded-md border bg-card">
          <SimpleEmpty description={t('search.emptyResult')} icon={SearchIcon}>
            {!editing && (
              <Button
                size={'small'}
                type={'fill'}
                icon={
                  <span className="anticon" role="img">
                    <Edit2Icon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                  </span>
                }
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t('edit', { ns: 'common' })}
              </Button>
            )}
          </SimpleEmpty>
        </div>
      );

    return (
      <div
        className="flex flex-row gap-2 overflow-x-auto"
        style={{ minHeight: ITEM_HEIGHT, paddingBottom: 8, width: '100%' }}
      >
        {searchResults.slice(0, 5).map((result) => (
          <SearchResultItem
            key={result.url}
            style={{ minWidth: ITEM_WIDTH, width: ITEM_WIDTH }}
            {...result}
          />
        ))}
        {!isMobile && searchResults.length > 5 && (
          <ShowMore
            engines={defaultEngines}
            messageId={messageId}
            resultsNumber={searchResults.length - 5}
            style={{ minWidth: ITEM_WIDTH }}
          />
        )}
      </div>
    );
  },
);

export default SearchResult;
