'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

import type { WebSearchArgs, WebSearchPluginState, WebSearchResult } from '../../../types';

const styles = {
  hostname: 'truncate text-xs leading-5 text-muted-foreground',
  metadata: 'min-w-0 truncate text-xs leading-5 text-muted-foreground',
  queryRow: 'min-w-0 items-center justify-between px-1 py-0.5',
  resultItem: 'min-w-0 border-b border-divider px-1 py-1.5 last:border-b-0',
  root: 'min-w-0 max-h-70 overflow-auto py-0.5',
  snippet: 'text-xs leading-5 text-muted-foreground',
  title: 'truncate text-sm leading-5.5 font-medium text-foreground hover:text-primary-text',
};

const getWebSearchHostname = (link: string): string | undefined => {
  try {
    const url = new URL(link);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname || undefined
      : undefined;
  } catch {
    return;
  }
};

const isWebSearchResult = (value: unknown): value is WebSearchResult => {
  if (!value || typeof value !== 'object') return false;

  const { link } = value as Partial<WebSearchResult>;
  return typeof link === 'string' && !!getWebSearchHostname(link);
};

const WebSearch = memo<BuiltinRenderProps<WebSearchArgs, WebSearchPluginState>>(
  ({ args, content, pluginState }) => {
    const results = pluginState?.results?.filter(isWebSearchResult) ?? [];

    if (results.length === 0) {
      if (!content) return null;

      return (
        <CodeBlock
          wrap
          code={content}
          language={'text'}
          style={{ maxHeight: 240, overflow: 'auto' }}
          variant={'ghost'}
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      );
    }

    const query = pluginState?.query || args?.query;
    const duration =
      typeof pluginState?.durationSeconds === 'number' &&
      Number.isFinite(pluginState.durationSeconds) &&
      pluginState.durationSeconds >= 0
        ? `${pluginState.durationSeconds.toFixed(2)}s`
        : undefined;

    return (
      <div className={cn('flex flex-col gap-0', styles.root)}>
        {(query || duration) && (
          <div className={cn('flex flex-row gap-2', styles.queryRow)}>
            <span className={styles.metadata}>{query}</span>
            {duration && <span className={styles.metadata}>{duration}</span>}
          </div>
        )}
        {results.map((result, index) => {
          const hostname = getWebSearchHostname(result.link);
          const title = result.title || hostname || result.link;

          return (
            <div
              className={cn('flex flex-col gap-1', styles.resultItem)}
              key={`${result.link}-${index}`}
            >
              <a href={result.link} rel={'noreferrer'} target={'_blank'}>
                <span className={styles.title}>{title}</span>
              </a>
              <div className={cn(styles.hostname)}>{hostname || result.link}</div>
              {result.snippet && <div className={cn(styles.snippet)}>{result.snippet}</div>}
            </div>
          );
        })}
      </div>
    );
  },
);

WebSearch.displayName = 'ClaudeCodeWebSearch';

export default WebSearch;
