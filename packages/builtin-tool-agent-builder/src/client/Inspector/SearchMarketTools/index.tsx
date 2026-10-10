'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { SearchMarketToolsParams, SearchMarketToolsState } from '../../../types';

export const SearchMarketToolsInspector = memo<
  BuiltinInspectorProps<SearchMarketToolsParams, SearchMarketToolsState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const query = args?.query || partialArgs?.query;
  const category = args?.category || partialArgs?.category;
  const displayText = query || category;

  // Initial streaming state
  if (isArgumentsStreaming && !displayText) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-agent-builder.apiName.searchMarketTools')}
        </span>
      </div>
    );
  }

  const resultCount = pluginState?.tools?.length ?? 0;
  const hasResults = resultCount > 0;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-agent-builder.apiName.searchMarketTools')}:{' '}
      </span>
      {displayText && <span className={highlightTextStyles.primary}>{displayText}</span>}
      {!isLoading &&
        !isArgumentsStreaming &&
        pluginState?.tools &&
        (hasResults ? (
          <span className="ms-1">({resultCount})</span>
        ) : (
          <span className="ms-1 text-[12px] text-[var(--ant-color-text-description)]">
            ({t('builtins.orvilo-agent-builder.inspector.noResults')})
          </span>
        ))}
    </div>
  );
});

SearchMarketToolsInspector.displayName = 'SearchMarketToolsInspector';

export default SearchMarketToolsInspector;
