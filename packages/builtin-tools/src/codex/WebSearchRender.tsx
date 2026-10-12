'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type CodexWebSearchArgs,
  getWebSearchOutput,
  getWebSearchQuery,
  getWebSearchResults,
} from './webSearchUtils';

const styles = {
  output:
    'm-0 max-h-70 overflow-auto px-1 py-0.5 font-sans text-sm leading-5.5 whitespace-pre-wrap text-muted-foreground',
  query: 'min-w-0 truncate text-foreground',
  queryLabel: 'shrink-0 text-muted-foreground',
  queryRow: 'items-center gap-1.5 px-1 py-0.5 text-xs leading-5',
  resultItem: 'min-w-0 border-be border-divider px-1 py-1.5 last:border-be-0',
  resultList: 'min-w-0 gap-0',
  root: 'min-w-0 gap-1 py-0.5',
  snippet: 'text-xs leading-5 text-muted-foreground',
  title: 'truncate text-sm font-medium leading-5.5 text-foreground hover:text-primary-text',
  url: 'truncate text-xs leading-5 text-muted-foreground',
};

const WebSearchRender = memo<BuiltinRenderProps<CodexWebSearchArgs, CodexWebSearchArgs>>(
  ({ args, content, pluginState }) => {
    const { t } = useTranslation('plugin');
    const query = getWebSearchQuery(args) || getWebSearchQuery(pluginState);
    const argResults = getWebSearchResults(args, content);
    const results = argResults.length > 0 ? argResults : getWebSearchResults(pluginState);
    const output = results.length > 0 ? '' : getWebSearchOutput(content);

    if (!query && results.length === 0 && !output) return null;

    return (
      <div className={cn('flex', 'flex-col', styles.root)}>
        {query && (
          <div className={cn('flex', styles.queryRow)}>
            <span className={styles.queryLabel}>
              {t('builtins.codex.webSearch.query', { defaultValue: 'Query' })}
            </span>
            <span className={styles.query}>{query}</span>
          </div>
        )}
        {results.length > 0 && (
          <div className={cn('flex', 'flex-col', styles.resultList)}>
            {results.map((result, index) => {
              const key = result.url || `${result.title}-${index}`;
              const title = <span className={styles.title}>{result.title}</span>;

              return (
                <div className={cn('flex', 'flex-col', 'gap-1', styles.resultItem)} key={key}>
                  {result.url ? (
                    <a
                      className="inline-flex min-h-8 items-center rounded-(--radius-button) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      href={result.url}
                      rel={'noreferrer'}
                      target={'_blank'}
                    >
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                  {result.url && <div className={styles.url}>{result.url}</div>}
                  {result.snippet && <div className={styles.snippet}>{result.snippet}</div>}
                </div>
              );
            })}
          </div>
        )}
        {output && <pre className={styles.output}>{output}</pre>}
      </div>
    );
  },
);

WebSearchRender.displayName = 'CodexWebSearchRender';

export default WebSearchRender;
