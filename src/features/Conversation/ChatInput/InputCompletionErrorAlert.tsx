'use client';

import { TriangleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useBusinessInputCompletionErrorAlert } from '@/business/client/hooks/useBusinessInputCompletionErrorAlert';
import ActionIcon from '@/components/ActionIcon';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { selectors, useChatInputStore } from '@/features/ChatInput/store';
import type { InputCompletionError } from '@/features/ChatInput/store/initialState';

export const InputCompletionErrorAlertContent = memo<{
  inputCompletionError: InputCompletionError;
}>(({ inputCompletionError }) => {
  const { t } = useTranslation('chat');
  const clearInputCompletionError = useChatInputStore((state) => state.clearInputCompletionError);
  const dismissInputCompletionError = useChatInputStore(
    (state) => state.dismissInputCompletionError,
  );
  const businessAlert = useBusinessInputCompletionErrorAlert({
    error: inputCompletionError,
    onRetry: clearInputCompletionError,
  });

  const action = businessAlert.action ?? (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="default" onClick={clearInputCompletionError}>
        {t('input.inputCompletionError.retry')}
      </Button>
      <Link to={'/settings/agent'}>
        <Button size="sm">{t('input.inputCompletionError.settings')}</Button>
      </Link>
    </div>
  );

  return (
    <>
      <div className="flex flex-col" style={{ paddingBlock: '0 6px' }}>
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>
            {businessAlert.description ?? t('input.inputCompletionError.title')}
          </AlertTitle>
          <AlertAction>
            {action}{' '}
            <ActionIcon
              icon={X}
              size={'small'}
              onClick={() => {
                dismissInputCompletionError?.();
              }}
            />
          </AlertAction>
        </Alert>
      </div>
      {businessAlert.extra}
    </>
  );
});

InputCompletionErrorAlertContent.displayName = 'InputCompletionErrorAlertContent';

const InputCompletionErrorAlert = memo(() => {
  const inputCompletionError = useChatInputStore(selectors.inputCompletionErrorVisible);

  if (!inputCompletionError) return null;

  return <InputCompletionErrorAlertContent inputCompletionError={inputCompletionError} />;
});

InputCompletionErrorAlert.displayName = 'InputCompletionErrorAlert';

export default InputCompletionErrorAlert;
