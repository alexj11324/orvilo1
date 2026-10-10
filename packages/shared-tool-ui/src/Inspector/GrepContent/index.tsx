'use client';

import type { GrepContentState } from '@orvilo/tool-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Fragment, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '../../styles';

const styles = {
  separator: 'mx-0.5 text-[var(--ant-color-text-quaternary)]',
  tag: 'rounded-[4px] bg-accent px-1.5 py-px font-mono text-[12px] text-foreground',
  tagsList: 'inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap ms-1.5',
};

const splitPattern = (pattern: string): string[] =>
  pattern
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

const PatternTags = memo<{ pattern: string }>(({ pattern }) => {
  const parts = splitPattern(pattern);
  if (parts.length === 0) return null;

  return (
    <span className={styles.tagsList}>
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index > 0 && <span className={styles.separator}>|</span>}
          <span className={styles.tag}>{part}</span>
        </Fragment>
      ))}
    </span>
  );
});
PatternTags.displayName = 'GrepPatternTags';

interface GrepContentArgs {
  directory?: string;
  path?: string;
  pattern?: string;
}

interface CreateGrepContentInspectorOptions {
  noResultsKey: string;
  translationKey: string;
}

export const createGrepContentInspector = ({
  translationKey,
  noResultsKey,
}: CreateGrepContentInspectorOptions) => {
  const Inspector = memo<BuiltinInspectorProps<GrepContentArgs, GrepContentState>>(
    ({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
      const { t } = useTranslation('plugin');

      const pattern = args?.pattern || partialArgs?.pattern || '';

      if (isArgumentsStreaming) {
        if (!pattern)
          return (
            <div className={inspectorTextStyles.root}>
              <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}</span>
            </div>
          );

        return (
          <div className={inspectorTextStyles.root} style={{ alignItems: 'baseline' }}>
            <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}:</span>
            <PatternTags pattern={pattern} />
          </div>
        );
      }

      const resultCount = pluginState?.totalMatches ?? 0;
      const hasResults = resultCount > 0;

      return (
        <div className={inspectorTextStyles.root} style={{ alignItems: 'baseline' }}>
          <span className={cn(isLoading && shinyTextStyles.shinyText)}>
            {t(translationKey as any)}:
          </span>
          {pattern && <PatternTags pattern={pattern} />}
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
        </div>
      );
    },
  );
  Inspector.displayName = 'GrepContentInspector';
  return Inspector;
};
