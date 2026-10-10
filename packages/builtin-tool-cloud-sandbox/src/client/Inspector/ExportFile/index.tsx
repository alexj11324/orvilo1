'use client';

import { FilePathDisplay } from '@orvilo/shared-tool-ui/components';
import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExportFileState } from '../../../types';

interface ExportFileArgs {
  path?: string;
}

export const ExportFileInspector = memo<BuiltinInspectorProps<ExportFileArgs, ExportFileState>>(
  ({ args, partialArgs, isArgumentsStreaming, pluginState, isLoading }) => {
    const { t } = useTranslation('plugin');

    const filePath = args?.path || partialArgs?.path || '';
    const showShiny = isArgumentsStreaming || isLoading;

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(showShiny && shinyTextStyles.shinyText)} style={{ marginInlineEnd: 6 }}>
          {t('builtins.orvilo-cloud-sandbox.apiName.exportFile')}:
        </span>
        {filePath && <FilePathDisplay filePath={filePath} />}
        {!isLoading && pluginState !== undefined && (
          <span style={{ marginInlineStart: 4 }}>
            {pluginState.success ? (
              <span className="anticon" role="img">
                <Check
                  color={'var(--success)'}
                  fill={'transparent'}
                  height={14}
                  size={14}
                  width={14}
                />
              </span>
            ) : (
              <span className="anticon" role="img">
                <X
                  color={'var(--destructive)'}
                  fill={'transparent'}
                  height={14}
                  size={14}
                  width={14}
                />
              </span>
            )}
          </span>
        )}
      </div>
    );
  },
);

ExportFileInspector.displayName = 'ExportFileInspector';
