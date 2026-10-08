import { isRemoteServerNetworkError } from '@orvilo/types';
import { errorMessageFrom } from '@orvilo/utils/error';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { remoteServerErrorToast } from '@/components/Error/remoteServerErrorToast';
import { toast } from '@/components/toast';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAiInfraStore } from '@/store/aiInfra/store';
import { type CreateAiProviderParams } from '@/types/aiProvider';

import { normalizeProviderSettings } from '../providerSettings';

export function useCreateProvider(close: () => void) {
  const { t } = useTranslation('modelProvider');
  const [loading, setLoading] = useState(false);
  const create = useAiInfraStore((s) => s.createNewAiProvider);
  const navigate = useWorkspaceAwareNavigate();
  const onFinish = async (values: CreateAiProviderParams) => {
    setLoading(true);
    try {
      await create({
        ...values,
        name: values.name || values.id,
        settings: normalizeProviderSettings({
          nextSettings: values.settings,
        }) as CreateAiProviderParams['settings'],
      });
      navigate(`/settings/provider/${values.id}`);
      toast.success(t('createNewAiProvider.createSuccess'));
      close();
    } catch (error) {
      const meta = (
        error as { meta?: { response?: Response; responseJSON?: { errorType?: unknown } } }
      )?.meta;
      const errorType = meta?.responseJSON?.errorType;
      if (
        meta?.response?.status === 502 &&
        meta.response.headers.has('X-Proxy-Error') &&
        isRemoteServerNetworkError(errorType)
      ) {
        // Reuse the same host/id as the TRPC proxy notification, including races.
        remoteServerErrorToast(errorType);
      } else {
        toast.error(errorMessageFrom(error) || t('createNewAiProvider.createFailed'));
      }
    } finally {
      setLoading(false);
    }
  };
  return { loading, onFinish };
}
