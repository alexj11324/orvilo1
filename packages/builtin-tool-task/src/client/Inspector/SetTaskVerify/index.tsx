'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { SetTaskVerifyParams, SetTaskVerifyState } from '../../../types';

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
};

export const SetTaskVerifyInspector = memo<
  BuiltinInspectorProps<SetTaskVerifyParams, SetTaskVerifyState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const identifier = args?.identifier || partialArgs?.identifier;

  return (
    <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-task.apiName.setTaskVerify')}
      </span>
      {identifier && <span className={styles.identifierChip}>{identifier}</span>}
    </div>
  );
});

SetTaskVerifyInspector.displayName = 'SetTaskVerifyInspector';

export default SetTaskVerifyInspector;
