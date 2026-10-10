'use client';

import { MaterialFileTypeIcon } from '@lobehub/ui';
import type { RenameLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import path from 'path-browserify-esm';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { LocalRenameFileState } from '../../..';

const styles = {
  icon: 'me-1 shrink-0',
};

export const RenameLocalFileInspector = memo<
  BuiltinInspectorProps<RenameLocalFileParams, LocalRenameFileState>
>(({ args, partialArgs, isArgumentsStreaming }) => {
  const { t } = useTranslation('plugin');

  const filePath = args?.path || partialArgs?.path || '';
  const newName = args?.newName || partialArgs?.newName || '';

  // Get the old filename from path
  const oldName = filePath ? path.basename(filePath) : '';

  return (
    <div
      className={cn(inspectorTextStyles.root, isArgumentsStreaming && shinyTextStyles.shinyText)}
    >
      {oldName && newName ? (
        <>
          {t('builtins.orvilo-local-system.apiName.renameLocalFile')} {oldName} →{' '}
          <MaterialFileTypeIcon
            className={styles.icon}
            filename={newName}
            size={16}
            type={'file'}
            variant={'raw'}
          />
          <span className={highlightTextStyles.primary}>{newName}</span>
        </>
      ) : (
        <span>{t('builtins.orvilo-local-system.apiName.renameLocalFile')}</span>
      )}
    </div>
  );
});

RenameLocalFileInspector.displayName = 'RenameLocalFileInspector';
