'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { SearchAgentParams, SearchAgentState } from '../../../types';

export const SearchAgentInspector = memo<
  BuiltinInspectorProps<SearchAgentParams, SearchAgentState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const query = args?.query || partialArgs?.query;

  // Initial streaming state
  if (isArgumentsStreaming && !query) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.searchAgent')}
        </span>
      </div>
    );
  }

  const resultCount = pluginState?.total ?? pluginState?.agents?.length ?? 0;
  const hasResults = resultCount > 0;

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-group-agent-builder.apiName.searchAgent')}
      </span>
      {query && (
        <>
          :<span className={highlightTextStyles.primary}>{query}</span>
        </>
      )}
      {!isLoading &&
        !isArgumentsStreaming &&
        pluginState?.agents &&
        (hasResults ? (
          <span style={{ marginInlineStart: 4 }}>({resultCount})</span>
        ) : (
          <span
            className="text-[12px]"
            style={{ marginInlineStart: 4, color: 'var(--ant-color-text-description)' }}
          >
            ({t('builtins.orvilo-group-agent-builder.inspector.noResults')})
          </span>
        ))}
    </div>
  );
});

SearchAgentInspector.displayName = 'SearchAgentInspector';

export default SearchAgentInspector;
