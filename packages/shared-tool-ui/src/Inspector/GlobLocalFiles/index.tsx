'use client';

import type { GlobFilesState } from '@orvilo/tool-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '../../styles';

const styles = {
  statusIcon: 'self-center ms-1',
  tag: 'rounded-[4px] bg-accent px-1.5 py-px font-mono text-[12px] text-foreground ms-1.5',
};

interface GlobFilesArgs {
  directory?: string;
  pattern?: string;
}

export const createGlobLocalFilesInspector = (translationKey: string) => {
  const Inspector = memo<BuiltinInspectorProps<GlobFilesArgs, GlobFilesState>>(
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
            <span className={styles.tag}>{pattern}</span>
          </div>
        );
      }

      const hasFiles = (pluginState?.totalCount ?? 0) > 0;

      return (
        <div className={inspectorTextStyles.root} style={{ alignItems: 'baseline' }}>
          <span className={cn(isLoading && shinyTextStyles.shinyText)}>
            {t(translationKey as any)}:
          </span>
          {pattern && <span className={styles.tag}>{pattern}</span>}
          {isLoading ? null : pluginState ? (
            hasFiles ? (
              <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
            ) : (
              <X className={styles.statusIcon} color={'var(--destructive)'} size={14} />
            )
          ) : null}
        </div>
      );
    },
  );
  Inspector.displayName = 'GlobLocalFilesInspector';
  return Inspector;
};
