import { confirmModal, toast } from '@lobehub/ui/base-ui';
import { EllipsisVertical, LucideRefreshCcwDot, PlusIcon } from 'lucide-react';
import { memo, type ReactNode, use, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';
import { aiModelSelectors } from '@/store/aiInfra/selectors';

import { createCreateNewModelModal } from './CreateNewModelModal';
import Search from './ModelTitle/Search';
import { ProviderSettingsContext } from './ProviderSettingsContext';

interface ModelToolbarProps {
  provider: string;
  showAddNewModel?: boolean;
  showModelFetcher?: boolean;
}

/** Toolbar row of the models panel: search, fetch, add and the reset menu. */
const ModelToolbar = memo<ModelToolbarProps>(
  ({ provider, showAddNewModel = true, showModelFetcher = true }) => {
    const { t } = useTranslation('modelProvider');
    const mobile = useIsMobile();

    const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');
    const [searchKeyword, isEmpty, fetchRemoteModelList, clearModelsByProvider, useFetch] =
      useAiInfraStore((s) => [
        s.modelSearchKeyword,
        aiModelSelectors.isEmptyAiProviderModelList(s),
        s.fetchRemoteModelList,
        s.clearModelsByProvider,
        s.useFetchAiProviderModels,
      ]);

    const { isLoading } = useFetch(provider);
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

    // The empty state carries its own add/fetch actions.
    if (!isLoading && isEmpty) return null;

    const handleSearch = (value: string) => {
      useAiInfraStore.setState({ modelSearchKeyword: value });
    };

    return (
      <div className="flex min-h-11 items-center gap-2 border-b border-border px-3 py-1.5 max-sm:flex-wrap">
        {isLoading ? (
          <Skeleton className="ml-auto h-7 w-30" />
        ) : isEmpty ? null : (
          <>
            <Search
              className={mobile ? 'w-full' : 'w-full max-w-[260px]'}
              value={searchKeyword}
              onChange={handleSearch}
            />
            <span className="flex-1" />
            {showModelFetcher &&
              withReason(
                <Button
                  disabled={!canManageProvider}
                  loading={fetchRemoteModelsLoading}
                  size="sm"
                  variant="ghost"
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
            {showAddNewModel &&
              withReason(
                <Button
                  aria-label={t('providerModels.list.addNew')}
                  disabled={!canManageProvider}
                  size="sm"
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
            <SidebarDropdownMenu
              placement="bottomRight"
              items={[
                {
                  disabled: !canManageProvider,
                  key: 'reset',
                  label: t('providerModels.list.resetAll.title'),
                  onClick: async () => {
                    if (!canManageProvider) return;
                    confirmModal({
                      content: t('providerModels.list.resetAll.conform'),
                      onOk: async () => {
                        await clearModelsByProvider(provider);
                        toast.success(t('providerModels.list.resetAll.success'));
                      },
                      title: t('providerModels.list.resetAll.title'),
                    });
                  },
                },
              ]}
            >
              <Button aria-label={t('more', { ns: 'common' })} size="icon-sm" variant="ghost">
                <EllipsisVertical />
              </Button>
            </SidebarDropdownMenu>
          </>
        )}
      </div>
    );
  },
);

export default ModelToolbar;
