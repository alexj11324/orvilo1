'use client';

import type { MoveFilesState } from '@orvilo/tool-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '../../styles';

interface MoveFilesArgs {
  items?: Array<{ newPath?: string; oldPath?: string }>;
  operations?: Array<{ destination?: string; source?: string }>;
}

export const createMoveLocalFilesInspector = (translationKey: string) => {
  const Inspector = memo<BuiltinInspectorProps<MoveFilesArgs, MoveFilesState>>(
    ({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
      const { t } = useTranslation('plugin');

      const sourceArgs = args || partialArgs || {};
      const itemsCount = sourceArgs.operations?.length ?? sourceArgs.items?.length ?? 0;

      const totalCount = pluginState?.totalCount ?? itemsCount;
      const successCount = pluginState?.successCount;
      const allSucceeded =
        successCount !== undefined && totalCount > 0 && successCount === totalCount;

      const showShiny = isArgumentsStreaming || isLoading;

      return (
        <div className={inspectorTextStyles.root}>
          <span
            className={cn(showShiny && shinyTextStyles.shinyText)}
            style={{ marginInlineEnd: 6 }}
          >
            {t(translationKey as any)}
          </span>
          {totalCount > 0 && (
            <span className="font-mono rounded bg-muted px-1 text-[12px]">
              {successCount === undefined ? totalCount : `${successCount}/${totalCount}`}
            </span>
          )}
          {!isLoading && successCount !== undefined && (
            <span style={{ marginInlineStart: 4 }}>
              {allSucceeded ? (
                <Check size={14} style={{ color: 'var(--success)' }} />
              ) : (
                <X size={14} style={{ color: 'var(--destructive)' }} />
              )}
            </span>
          )}
        </div>
      );
    },
  );
  Inspector.displayName = 'MoveLocalFilesInspector';
  return Inspector;
};
