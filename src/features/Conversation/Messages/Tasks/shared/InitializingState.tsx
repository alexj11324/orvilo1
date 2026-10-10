'use client';


import { cn } from 'cn';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

import { formatElapsedTime } from './utils';

const styles = {
  container: 'py-3',
};

const InitializingState = memo(() => {
  const { t } = useTranslation('chat');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for updating elapsed time every second
  useEffect(() => {
    const startTime = Date.now();

    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn('flex flex-col gap-3', styles.container)}>
      <div className="flex items-center gap-2">
        <NeuralNetworkLoading size={14} />
        <div className='font-medium shinyTextStyles.shinyText'>
          {t('task.status.initializing')}
        </div>
        <div className='text-muted-foreground'>({formatElapsedTime(elapsedTime)})</div>
      </div>
    </div>
  );
});

InitializingState.displayName = 'InitializingState';

export default InitializingState;
