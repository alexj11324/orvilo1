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
          multiline
          className="min-w-0 max-w-full break-words [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          disabled={onRetry ? false : disabled}
          loading={loading}
          size="compact"
          variant="default"
          onClick={() => (onRetry ? onRetry() : retryParentMessage())}
        >
          <RotateCw className="size-4" size={16} /> {t('unknownError.retry')}
        </Button>
      }
    />
  );
});

export default QuotaLimitError;
