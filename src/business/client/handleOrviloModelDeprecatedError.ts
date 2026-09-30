import { ChatErrorType } from '@orvilo/types';
import { TRPCClientError } from '@trpc/client';
import { t } from 'i18next';

import { toast } from '@/components/toast';

interface OrviloModelDeprecatedErrorData {
  modelType?: string;
  requestedModel?: string;
}

export const handleOrviloModelDeprecatedError = (error: unknown) => {
  if (!(error instanceof TRPCClientError) || error.message !== ChatErrorType.OrviloModelDeprecated)
    return;

  const requestedModel = (error.data?.errorData as OrviloModelDeprecatedErrorData | undefined)
    ?.requestedModel;

  toast.error(
    t('response.OrviloModelDeprecated', {
      model: requestedModel ?? '-',
      ns: 'error',
    }),
  );
};
