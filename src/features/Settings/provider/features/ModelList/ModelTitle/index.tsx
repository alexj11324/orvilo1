import { toast } from '@lobehub/ui/base-ui';
import { CircleX } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';
import { aiModelSelectors } from '@/store/aiInfra/selectors';

interface ModelTitleProps {
  provider: string;
}

/** Section heading of the models panel: title, clear-fetched action and enabled count. */
const ModelTitle = memo<ModelTitleProps>(({ provider }) => {
  const { t } = useTranslation('modelProvider');

  const { allowed: canManageProvider } = usePermission('manage_provider_key');
  const [hasRemoteModels, clearObtainedModels, useFetchAiProviderModels, enabledCount] =
    useAiInfraStore((s) => [
      aiModelSelectors.hasRemoteModels(s),
      s.clearRemoteModels,
      s.useFetchAiProviderModels,
      aiModelSelectors.enabledAiProviderModelList(s).length,
    ]);

  const { isLoading } = useFetchAiProviderModels(provider);
  const [clearRemoteModelsLoading, setClearRemoteModelsLoading] = useState(false);

  useEffect(() => {
    useAiInfraStore.setState({ modelSearchKeyword: '' });
  }, [provider]);

  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-sm font-semibold">{t('providerModels.list.title')}</h2>
      {isLoading ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('providerModels.list.enabledCount', { count: enabledCount })}
        </span>
      )}

      {/* Only meaningful once the list has loaded, so it waits rather
          than holding a skeleton next to the title. */}
      {!isLoading && hasRemoteModels && (
        <ActionIcon
          disabled={!canManageProvider}
          icon={CircleX}
          loading={clearRemoteModelsLoading}
          size={'small'}
          title={canManageProvider ? t('providerModels.list.fetcher.clear') : undefined}
          onClick={async () => {
            if (!canManageProvider) return;
            setClearRemoteModelsLoading(true);
            try {
              await clearObtainedModels(provider);
            } catch (error) {
              console.error(error);
              toast.error(t('providerModels.list.fetcher.errorFallback'));
            } finally {
              setClearRemoteModelsLoading(false);
            }
          }}
        />
      )}
    </div>
  );
});
export default ModelTitle;
