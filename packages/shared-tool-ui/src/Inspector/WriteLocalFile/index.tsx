'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FilePathDisplay } from '../../components/FilePathDisplay';
import { inspectorTextStyles, shinyTextStyles } from '../../styles';

interface WriteFileArgs {
  content?: string;
  file_path?: string;
  filePath?: string;
  path?: string;
}

export const createWriteLocalFileInspector = (translationKey: string) => {
  const Inspector = memo<BuiltinInspectorProps<WriteFileArgs, any>>(
    ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
      const { t } = useTranslation('plugin');

      const filePath =
        args?.path ||
        args?.filePath ||
        args?.file_path ||
        partialArgs?.path ||
        partialArgs?.filePath ||
        partialArgs?.file_path ||
        '';
      const lineCount = args?.content?.split('\n').length;

      if (isArgumentsStreaming) {
        if (!filePath)
          return (
            <div className={inspectorTextStyles.root}>
              <span className={shinyTextStyles.shinyText}>{t(translationKey as any)}</span>
            </div>
          );

        return (
          <div className={inspectorTextStyles.root}>
            <span className={shinyTextStyles.shinyText} style={{ marginInlineEnd: 6 }}>
              {t(translationKey as any)}:
            </span>
            <FilePathDisplay filePath={filePath} />
          </div>
        );
      }

      return (
        <div className={inspectorTextStyles.root}>
          <span
            className={cn(isLoading && shinyTextStyles.shinyText)}
            style={{ marginInlineEnd: 6 }}
          >
            {t(translationKey as any)}:
          </span>
          <FilePathDisplay filePath={filePath} />
          {!isLoading && lineCount && (
            <>
              {' '}
              <span
                className="font-mono rounded bg-muted px-1 text-[12px]"
                style={{ color: 'var(--success)' }}
              >
                <Plus size={12} />
                {lineCount}
              </span>
            </>
          )}
        </div>
      );
    },
  );
  Inspector.displayName = 'WriteLocalFileInspector';
  return Inspector;
};
