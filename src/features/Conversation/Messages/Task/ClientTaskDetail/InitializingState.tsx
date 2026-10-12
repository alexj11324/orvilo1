'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

const styles = { container: 'py-3' };

const InitializingState = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div className={cn('flex flex-col gap-3', styles.container)}>
      <div className="flex items-center gap-2">
        <NeuralNetworkLoading size={16} />
        <div className="text-sm font-medium">{t('task.status.initializing')}</div>
      </div>
    </div>
  );
});

InitializingState.displayName = 'InitializingState';

export default InitializingState;
