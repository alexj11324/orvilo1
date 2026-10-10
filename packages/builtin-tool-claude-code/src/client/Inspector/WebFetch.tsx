'use client';

import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Globe } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type WebFetchArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 ms-1.5 py-0.5 px-2.5 rounded-[999px] bg-accent',
  icon: 'shrink-0 text-[var(--ant-color-text-description)]',
  url: 'overflow-hidden min-w-0 font-mono text-[12px] text-foreground text-ellipsis whitespace-nowrap',
};

/**
 * Strip the protocol so the chip leads with the host — full URLs eat the
 * width quickly and the `https://` prefix is noise.
 */
const stripProtocol = (url: string): string => url.replace(/^https?:\/\//i, '');

export const WebFetchInspector = memo<BuiltinInspectorProps<WebFetchArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.WebFetch as any);
    const url = (args?.url || partialArgs?.url || '').trim();

    if (isArgumentsStreaming && !url) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    const isShiny = isArgumentsStreaming || isLoading;

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isShiny && shinyTextStyles.shinyText)}>
          {url ? `${label}:` : label}
        </span>
        {url && (
          <span className={styles.chip}>
            <Globe className={styles.icon} size={14} />
            <span className={styles.url}>{stripProtocol(url)}</span>
          </span>
        )}
      </div>
    );
  },
);

WebFetchInspector.displayName = 'ClaudeCodeWebFetchInspector';
