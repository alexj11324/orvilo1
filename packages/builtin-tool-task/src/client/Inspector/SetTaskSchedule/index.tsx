'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { SetTaskScheduleParams, SetTaskScheduleState } from '../../../types';

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
  modeChip:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-info-bg)] px-2 py-0.5 text-[12px] text-info',
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
};

export const SetTaskScheduleInspector = memo<
  BuiltinInspectorProps<SetTaskScheduleParams, SetTaskScheduleState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const identifier = args?.identifier || partialArgs?.identifier;
  const automationMode = args?.automationMode ?? partialArgs?.automationMode;
  const modeLabel = automationMode === null ? 'off' : automationMode;

  return (
    <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-task.apiName.setTaskSchedule')}
      </span>
      {identifier && <span className={styles.identifierChip}>{identifier}</span>}
      {modeLabel && (
        <>
          <span className={styles.separator}>·</span>
          <span className={styles.modeChip}>{modeLabel}</span>
        </>
      )}
    </div>
  );
});

SetTaskScheduleInspector.displayName = 'SetTaskScheduleInspector';

export default SetTaskScheduleInspector;
