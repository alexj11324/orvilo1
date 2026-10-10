'use client';

import type { BuiltinInspectorProps, SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

export const SearchInspector = memo<BuiltinInspectorProps<SearchQuery, UniformSearchResponse>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const query = args?.query || partialArgs?.query || '';
    const resultCount = pluginState?.results?.length ?? 0;
    const hasResults = resultCount > 0;

    if (isArgumentsStreaming && !query) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-web-browsing.apiName.search')}
          </span>
        </div>
      );
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-web-browsing.apiName.search')}:{'\u00A0'}
        </span>
        {query && <span className={highlightTextStyles.primary}>{query}</span>}
        {!isLoading &&
          !isArgumentsStreaming &&
          pluginState?.results &&
          (hasResults ? (
            <span style={{ marginInlineStart: 4 }}>({resultCount})</span>
          ) : (
            <span
              className="text-[12px]"
              style={{ marginInlineStart: 4, color: 'var(--ant-color-text-description)' }}
            >
              ({t('builtins.orvilo-web-browsing.inspector.noResults')})
            </span>
          ))}
      </div>
    );
  },
);

SearchInspector.displayName = 'SearchInspector';

export default SearchInspector;
