import type { RemoteServerNetworkErrorType } from '@orvilo/types';
import { t } from 'i18next';

import { toast } from '@/components/toast';

export const remoteServerErrorToast = (errorType: RemoteServerNetworkErrorType) => {
  toast.error({
    id: `remote-server-network-error-${errorType}`,
    title: t(`response.${errorType}`, { ns: 'error' }),
  });
};
