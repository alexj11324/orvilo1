'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { DeleteTaskParams, DeleteTaskState } from '../../../types';

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] border border-dashed border-[var(--ant-color-error-border)] bg-transparent px-2 py-0.5 font-mono text-[12px] text-destructive line-through ms-1.5',
};

export const DeleteTaskInspector = memo<BuiltinInspectorProps<DeleteTaskParams, DeleteTaskState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');

    const identifier = args?.identifier || partialArgs?.identifier;

    return (
      <div className={inspectorTextStyles.root}>
        <span
          className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}
          style={{ color: 'var(--destructive)' }}
        >
          {t('builtins.orvilo-task.apiName.deleteTask')}
        </span>
        {identifier && <span className={styles.identifierChip}>{identifier}</span>}
      </div>
    );
  },
);

DeleteTaskInspector.displayName = 'DeleteTaskInspector';

export default DeleteTaskInspector;
