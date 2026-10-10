'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { SearchKnowledgeBaseArgs, SearchKnowledgeBaseState } from '../../..';

export const SearchKnowledgeBaseInspector = memo<
  BuiltinInspectorProps<SearchKnowledgeBaseArgs, SearchKnowledgeBaseState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const query = args?.query || partialArgs?.query || '';
  // Use fileResults length for display (aggregated by file)
  const resultCount = pluginState?.fileResults?.length ?? 0;
  const hasResults = resultCount > 0;

  // During argument streaming
  if (isArgumentsStreaming) {
    if (!query)
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-knowledge-base.apiName.searchKnowledgeBase')}
          </span>
        </div>
      );

    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-knowledge-base.apiName.searchKnowledgeBase')}:{' '}
        </span>
        <span className={highlightTextStyles.gold}>{query}</span>
      </div>
    );
  }

  return (
    <div className={inspectorTextStyles.root}>
      <span style={{ marginInlineStart: 2 }}>
        <span className={cn(isLoading && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-knowledge-base.apiName.searchKnowledgeBase')}:{' '}
        </span>
        {query && <span className={highlightTextStyles.gold}>{query}</span>}
        {!isLoading &&
          pluginState?.fileResults &&
          (hasResults ? (
            <span style={{ marginInlineStart: 4 }}>({resultCount})</span>
          ) : (
            <span
              className="text-[12px]"
              style={{ marginInlineStart: 4, color: 'var(--ant-color-text-description)' }}
            >
              ({t('builtins.orvilo-knowledge-base.inspector.noResults')})
            </span>
          ))}
      </span>
    </div>
  );
});

SearchKnowledgeBaseInspector.displayName = 'SearchKnowledgeBaseInspector';
