import { CornerUpRight, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Confirmation,
  ConfirmationRejected,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { resolveRejectedCopyKey } from './resolveRejectedCopyKey';

interface RejectedResponseProps {
  apiName?: string;
  reason?: string;
  skipped?: boolean;
  toolCallId: string;
}

const RejectedResponse = memo<RejectedResponseProps>(({ apiName, reason, skipped, toolCallId }) => {
  const { t } = useTranslation('chat');
  const copy = t(resolveRejectedCopyKey({ apiName, reason, skipped }), { reason });

  // Skipping a question is a neutral interaction outcome, not a denied command.
  if (skipped)
    return (
      <Alert>
        <CornerUpRight />
        <AlertDescription>{copy}</AlertDescription>
      </Alert>
    );

  return (
    <Confirmation approval={{ id: toolCallId, approved: false, reason }} state="output-denied">
      <ConfirmationTitle>
        <ConfirmationRejected>
          <span className="flex items-center gap-2">
            <XIcon className="size-4 shrink-0 text-destructive" />
            {copy}
          </span>
        </ConfirmationRejected>
      </ConfirmationTitle>
    </Confirmation>
  );
});

export default RejectedResponse;
