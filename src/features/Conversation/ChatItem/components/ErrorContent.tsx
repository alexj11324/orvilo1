import { RotateCcw } from 'lucide-react';
import { memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorAlert from '@/features/Conversation/components/ErrorAlert';
import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
} from '@/features/Conversation/store';

import { type ChatItemProps } from '../type';

export interface ErrorContentProps {
  customErrorRender?: ChatItemProps['customErrorRender'];
  error: ChatItemProps['error'];
  id?: string;
  onRegenerate?: () => void;
}

const ErrorContent = memo<ErrorContentProps>(({ customErrorRender, error, id, onRegenerate }) => {
  const { t } = useTranslation('common');
  const [deleteMessage, updateMessageError] = useConversationStore((s) => [
    s.deleteMessage,
    s.updateMessageError,
  ]);
  const messageContent = useConversationStore((s) =>
    id ? dataSelectors.getDisplayMessageById(id)(s)?.content : undefined,
  );
  // The retry can take a while to produce anything visible (branch switch plus a
  // transport round trip), so the button has to own its own pending state —
  // otherwise a click reads as "nothing happened" and invites a second one.
  const retrying = useConversationStore((s) =>
    id ? messageStateSelectors.isMessageRegenerating(id)(s) : false,
  );

  if (!error) return;

  if (customErrorRender) {
    return (
      <Suspense fallback={<Skeleton style={{ height: 36 }} />}>{customErrorRender(error)}</Suspense>
    );
  }

  return (
    <ErrorAlert
      closable
      showIcon
      type={'secondary'}
      action={
        onRegenerate && (
          <Button
            disabled={retrying}
            loading={retrying}
            size="sm"
            variant="secondary"
            onClick={onRegenerate}
          >
            <RotateCcw size={14} /> {t('regenerate')}
          </Button>
        )
      }
      {...error}
      title={error.message}
      afterClose={() => {
        error?.afterClose?.();
        if (!id) return;
        // A turn can carry a terminal error on top of content it already
        // streamed. Dismissing the error must not delete that content — just
        // clear the error and keep the message.
        if (messageContent && messageContent.trim() !== '') {
          updateMessageError(id, null);
        } else {
          deleteMessage(id);
        }
      }}
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        ...error.style,
      }}
    />
  );
});

export default ErrorContent;
