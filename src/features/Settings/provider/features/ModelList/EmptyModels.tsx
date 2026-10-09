import { toast } from '@lobehub/ui/base-ui';
import { BrainIcon, LucideRefreshCcwDot, PlusIcon } from 'lucide-react';
import { memo, type ReactNode, use, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';

import { createCreateNewModelModal } from './CreateNewModelModal';
import { ProviderSettingsContext } from './ProviderSettingsContext';

const EmptyState = memo<{ provider: string }>(({ provider }) => {
  const { t } = useTranslation('modelProvider');

  const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');

  const [fetchRemoteModelList] = useAiInfraStore((s) => [s.fetchRemoteModelList]);

  const [fetchRemoteModelsLoading, setFetchRemoteModelsLoading] = useState(false);
  const { showDeployName } = use(ProviderSettingsContext);

  // A disabled button swallows pointer events, so the tooltip trigger is a wrapper span.
  const withReason = (node: ReactNode) =>
    canManageProvider ? (
      node
    ) : (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>{node}</TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10">
      <div className="flex size-20 items-center justify-center rounded-full bg-selected">
        <BrainIcon className="size-10 text-foreground" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-base font-medium">{t('providerModels.list.empty.title')}</div>
        <div className="max-w-[280px] text-center text-sm text-balance text-muted-foreground">
          {t('providerModels.list.empty.desc')}
        </div>
      </div>

      <div className="flex gap-2">
        {withReason(
          <Button
            disabled={!canManageProvider}
            variant="outline"
            onClick={() => {
              if (!canManageProvider) return;
              createCreateNewModelModal({
                existingModelIds: useAiInfraStore
                  .getState()
                  .aiProviderModelList.map((model) => model.id),
                showDeployName,
              });
            }}
          >
            <PlusIcon />
            {t('providerModels.list.addNew')}
          </Button>,
        )}
        {withReason(
          <Button
            disabled={!canManageProvider}
            loading={fetchRemoteModelsLoading}
            onClick={async () => {
              if (!canManageProvider) return;
              setFetchRemoteModelsLoading(true);
              try {
                await fetchRemoteModelList(provider);
              } catch (error) {
                console.error(error);

                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : t('providerModels.list.fetcher.errorFallback');

                toast.error(
                  t('providerModels.list.fetcher.error', {
                    message: errorMessage,
                  }),
                );
              } finally {
                setFetchRemoteModelsLoading(false);
              }
            }}
          >
            {!fetchRemoteModelsLoading && <LucideRefreshCcwDot />}
            {fetchRemoteModelsLoading
              ? t('providerModels.list.fetcher.fetching')
              : t('providerModels.list.fetcher.fetch')}
          </Button>,
        )}
      </div>
    </div>
  );
});

export default EmptyState;
