import { AlertTriangle, RotateCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import BaseErrorForm from '@/features/Conversation/Error/BaseErrorForm';

import { useRetryParentMessage } from './useRetryParentMessage';

interface QuotaLimitErrorProps {
  id: string;
  /**
   * Retry resolved by the render surface. Preferred over the parent-message
   * fallback because on the group surface `id` is a nested content block, whose
   * parent is another block rather than the user message.
   */
  onRetry?: () => void;
}

const QuotaLimitError = memo<QuotaLimitErrorProps>(({ id, onRetry }) => {
  const { t } = useTranslation('error');
  const { disabled, loading, retryParentMessage } = useRetryParentMessage(id);

  return (
    <BaseErrorForm
      avatar={<AlertTriangle size={24} />}
      title={t('response.QuotaLimitReachedCloud')}
      action={
        <Button
          disabled={onRetry ? false : disabled}
          loading={loading}
          size="sm"
          variant="default"
          onClick={() => (onRetry ? onRetry() : retryParentMessage())}
        >
          <RotateCw /> {t('unknownError.retry')}
        </Button>
      }
    />
  );
});

export default QuotaLimitError;
