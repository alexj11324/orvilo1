'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';

const styles = {
  row: 'flex-none w-full min-h-10 pbs-0.5 pbe-1 px-3 border-bs border-divider bg-card',
};

interface RefreshErrorProps {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}

export const RefreshError = memo<RefreshErrorProps>(({ error, onRetry, retrying }) => {
  const { t } = useTranslation('chat');

  return (
    <div
      aria-live={'polite'}
      className={cn('flex items-center justify-center', styles.row)}
      role={'status'}
    >
      <AsyncError
        error={error}
        retrying={retrying}
        title={t('chatList.refreshError')}
        variant={'inline'}
        onRetry={onRetry}
      />
    </div>
  );
});

RefreshError.displayName = 'ConversationRefreshError';
