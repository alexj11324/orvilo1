'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ViewTaskParams, ViewTaskState } from '../../../types';

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground ms-1.5',
};

export const ViewTaskInspector = memo<BuiltinInspectorProps<ViewTaskParams, ViewTaskState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const identifier = args?.identifier || partialArgs?.identifier || pluginState?.identifier;

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.viewTask')}
        </span>
        {identifier && <span className={styles.identifierChip}>{identifier}</span>}
      </div>
    );
  },
);

ViewTaskInspector.displayName = 'ViewTaskInspector';

export default ViewTaskInspector;
