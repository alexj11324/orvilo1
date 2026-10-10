'use client';

import type { SearchFilesState } from '@orvilo/tool-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '../../styles';

interface SearchFilesArgs {
  keyword?: string;
  keywords?: string;
  query?: string;
}

interface CreateSearchLocalFilesInspectorOptions {
  noResultsKey: string;
  translationKey: string;
}

export const createSearchLocalFilesInspector = ({
  translationKey,
  noResultsKey,
}: CreateSearchLocalFilesInspectorOptions) => {
  const Inspector = memo<BuiltinInspectorProps<SearchFilesArgs, SearchFilesState>>(
    ({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
      const { t } = useTranslation('plugin');

      // Support all keyword field variants
      const query =
        args?.keyword ||
        args?.keywords ||
        args?.query ||
        partialArgs?.keyword ||
        partialArgs?.keywords ||
        partialArgs?.query ||
        '';

      if (isArgumentsStreaming) {
        if (!query)
          return (
            <div className={inspectorTextStyles.root}>
              <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}</span>
            </div>
          );

        return (
          <div className={inspectorTextStyles.root}>
            <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}: </span>
            <span className={highlightTextStyles.primary}>{query}</span>
          </div>
        );
      }

      const resultCount = pluginState?.results?.length ?? pluginState?.totalCount ?? 0;
      const hasResults = resultCount > 0;

      return (
        <div className={inspectorTextStyles.root}>
          <span style={{ marginInlineStart: 2 }}>
            <span className={cn(isLoading && shinyTextStyles.shinyText)}>
              {t(translationKey as any)}:{' '}
            </span>
            {query && <span className={highlightTextStyles.primary}>{query}</span>}
            {!isLoading &&
              pluginState &&
              (hasResults ? (
                <span style={{ marginInlineStart: 4 }}>({resultCount})</span>
              ) : (
                <span
                  className="text-[12px]"
                  style={{ marginInlineStart: 4, color: 'var(--ant-color-text-description)' }}
                >
                  ({t(noResultsKey as any)})
                </span>
              ))}
          </span>
        </div>
      );
    },
  );
  Inspector.displayName = 'SearchLocalFilesInspector';
  return Inspector;
};
