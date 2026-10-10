import type { SearchQuery } from '@orvilo/types';
import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SearchBarUI from '@/components/SearchBar';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useChatStore } from '@/store/chat';
import { chatToolSelectors } from '@/store/chat/selectors';

import { CATEGORY_ICON_MAP, ENGINE_ICON_MAP } from '../../const';
import { CategoryAvatar } from './CategoryAvatar';
import { EngineAvatar } from './EngineAvatar';

const styles = {
  textHeader: 'flex-none w-[120px]',
};

interface SearchBarProps {
  aiSummary?: boolean;
  defaultCategories?: string[];
  defaultEngines?: string[];
  defaultQuery: string;
  defaultTimeRange?: string;
  messageId: string;
  onSearch?: (searchQuery: SearchQuery) => void;
  searchAddon?: ReactNode;
  tooltip?: boolean;
}

const SearchBar = memo<SearchBarProps>(
  ({
    defaultCategories = [],
    defaultEngines = [],
    defaultTimeRange,
    defaultQuery,
    tooltip = true,
    searchAddon,
    onSearch,
    messageId,
  }) => {
    const { t } = useTranslation('tool');
    const loading = useChatStore(chatToolSelectors.isSearXNGSearching(messageId));
    const [query, setQuery] = useState(defaultQuery);
    const [categories, setCategories] = useState(defaultCategories);
    const [engines, setEngines] = useState(defaultEngines);
    const [time_range, setTimeRange] = useState(defaultTimeRange);
    const isMobile = useIsMobile();
    const [reSearchWithSearXNG] = useChatStore((s) => [s.triggerSearchAgain]);

    const updateAndSearch = async () => {
      const data: SearchQuery = {
        query,
        searchCategories: categories,
        searchEngines: engines,
        searchTimeRange: time_range,
      };
      onSearch?.(data);
      await reSearchWithSearXNG(messageId, data);
    };

    const searchComponent = (
      <SearchBarUI
        autoFocus
        loading={loading}
        placeholder={t('search.searchBar.placeholder')}
        style={{ minWidth: isMobile ? undefined : 400, width: '100%' }}
        value={query}
        onSearch={updateAndSearch}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
    );

    return (
      <>
        <div className="flex flex-row items-center flex-1 gap-2 h-[32px] justify-between">
          {tooltip ? (
            <SimpleTooltip title={t('search.searchBar.tooltip')}>{searchComponent}</SimpleTooltip>
          ) : (
            searchComponent
          )}
          {searchAddon}
        </div>
        <div className="rounded-md border bg-card flex flex-col" style={{ gap: 24, padding: 12 }}>
          {isMobile ? (
            <div className="flex flex-row flex-wrap gap-3">
              {Object.keys(ENGINE_ICON_MAP).map((item) => (
                <label className="flex flex-row items-center gap-2" key={item}>
                  <Checkbox
                    checked={engines.includes(item)}
                    onCheckedChange={(checked) => {
                      setEngines(
                        checked === true
                          ? [...engines, item]
                          : engines.filter((engine) => engine !== item),
                      );
                    }}
                  />
                  <EngineAvatar engine={item} />
                  {item}
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-row items-start gap-2">
              <div className={`text-muted-foreground ${styles.textHeader}`}>
                {t('search.searchEngine.title')}
              </div>
              <div className="flex flex-row flex-wrap gap-3">
                {Object.keys(ENGINE_ICON_MAP).map((item) => (
                  <label className="flex flex-row items-center gap-2" key={item}>
                    <Checkbox
                      checked={engines.includes(item)}
                      onCheckedChange={(checked) => {
                        setEngines(
                          checked === true
                            ? [...engines, item]
                            : engines.filter((engine) => engine !== item),
                        );
                      }}
                    />
                    <EngineAvatar engine={item} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          )}

          {isMobile ? (
            <div className="flex flex-row flex-wrap gap-3">
              {Object.keys(CATEGORY_ICON_MAP).map((item) => (
                <label className="flex flex-row items-center gap-2" key={item}>
                  <Checkbox
                    checked={categories.includes(item)}
                    onCheckedChange={(checked) => {
                      setCategories(
                        checked === true
                          ? [...categories, item]
                          : categories.filter((category) => category !== item),
                      );
                    }}
                  />
                  <CategoryAvatar category={item as any} />
                  {t(`search.searchCategory.value.${item}` as any)}
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-row items-start gap-2">
              <div className={`text-muted-foreground ${styles.textHeader}`}>
                {t('search.searchCategory.title')}
              </div>
              <div className="flex flex-row flex-wrap gap-3">
                {Object.keys(CATEGORY_ICON_MAP).map((item) => (
                  <label className="flex flex-row items-center gap-2" key={item}>
                    <Checkbox
                      checked={categories.includes(item)}
                      onCheckedChange={(checked) =>
                        setCategories(
                          checked === true
                            ? [...categories, item]
                            : categories.filter((category) => category !== item),
                        )
                      }
                    />
                    <CategoryAvatar category={item as any} />
                    {t(`search.searchCategory.value.${item}` as any)}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-row items-center gap-4 flex-wrap">
            <div className={`text-muted-foreground ${styles.textHeader}`}>
              {t('search.searchTimeRange.title')}
            </div>
            <ToggleGroup
              value={time_range ? [time_range] : []}
              onValueChange={(value) => value[0] && setTimeRange(value[0])}
            >
              <ToggleGroupItem value="anytime">
                {t('search.searchTimeRange.value.anytime')}
              </ToggleGroupItem>
              <ToggleGroupItem value="day">{t('search.searchTimeRange.value.day')}</ToggleGroupItem>
              <ToggleGroupItem value="week">
                {t('search.searchTimeRange.value.week')}
              </ToggleGroupItem>
              <ToggleGroupItem value="month">
                {t('search.searchTimeRange.value.month')}
              </ToggleGroupItem>
              <ToggleGroupItem value="year">
                {t('search.searchTimeRange.value.year')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </>
    );
  },
);
export default SearchBar;
