'use client';

import {
  highlightTextStyles,
  inspectorTextStyles,
  shinyTextStyles,
} from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type ToolSearchArgs } from '../../types';

const SELECT_PREFIX = 'select:';

const styles = {
  tag: 'py-0.5 px-2.5 rounded-[999px] font-mono text-[12px] text-foreground bg-accent',
  tagsList: 'inline-flex shrink gap-1 items-center min-w-0 ms-1.5 whitespace-nowrap',
};

interface ParsedQuery {
  names: string[] | null;
  raw: string;
}

/**
 * `select:A,B,C` → ['A', 'B', 'C'] (exact-name loads, rendered as tags).
 * Keyword queries pass through as raw text.
 */
const parseQuery = (query?: string): ParsedQuery | undefined => {
  if (!query) return undefined;
  const trimmed = query.trim();
  if (!trimmed.toLowerCase().startsWith(SELECT_PREFIX)) {
    return { names: null, raw: trimmed };
  }
  const names = trimmed
    .slice(SELECT_PREFIX.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { names: names.length > 0 ? names : null, raw: trimmed };
};

export const ToolSearchInspector = memo<BuiltinInspectorProps<ToolSearchArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.ToolSearch as any);
    const parsed = parseQuery(args?.query || partialArgs?.query);

    if (isArgumentsStreaming && !parsed) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    const isShiny = isArgumentsStreaming || isLoading;

    if (parsed?.names) {
      return (
        <div className={inspectorTextStyles.root} style={{ alignItems: 'baseline' }}>
          <span className={cn(isShiny && shinyTextStyles.shinyText)}>{label}:</span>
          <span className={styles.tagsList}>
            {parsed.names.map((name, index) => (
              <span className={styles.tag} key={`${index}-${name}`}>
                {name}
              </span>
            ))}
          </span>
        </div>
      );
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>{label}</span>
        {parsed && (
          <>
            <span>: </span>
            <span className={highlightTextStyles.primary}>{parsed.raw}</span>
          </>
        )}
      </div>
    );
  },
);

ToolSearchInspector.displayName = 'ClaudeCodeToolSearchInspector';
