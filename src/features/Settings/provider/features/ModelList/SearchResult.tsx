'use client';

import isEqual from 'fast-deep-equal';
import { ToggleRightIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { usePermission } from '@/hooks/usePermission';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

import GroupHeader from './GroupHeader';
import ModelItem from './ModelItem';

const SearchResult = memo(() => {
  const { t } = useTranslation('modelProvider');
  const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');

  const searchKeyword = useAiInfraStore((s) => s.modelSearchKeyword);
  const batchToggleAiModels = useAiInfraStore((s) => s.batchToggleAiModels);

  const filteredModels = useAiInfraStore(aiModelSelectors.filteredAiProviderModelList, isEqual);

  const [batchLoading, setBatchLoading] = useState(false);

  const isEmpty = filteredModels.length === 0;
  return (
    <>
      <GroupHeader
        actions={
          !isEmpty && (
            <ActionIcon
              disabled={!canManageProvider}
              icon={ToggleRightIcon}
              loading={batchLoading}
              size={'small'}
              title={canManageProvider ? t('providerModels.list.enabledActions.enableAll') : reason}
              onClick={async () => {
                if (!canManageProvider) return;

                try {
                  setBatchLoading(true);
                  await batchToggleAiModels(
                    filteredModels.map((i) => i.id),
                    true,
                  );
                } finally {
                  setBatchLoading(false);
                }
              }}
            />
          )
        }
      >
        {t('providerModels.list.searchResult', { count: filteredModels.length })}
      </GroupHeader>

      {searchKeyword && isEmpty ? (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          {t('providerModels.searchNotFound')}
        </div>
      ) : (
        filteredModels.map((item) => <ModelItem {...item} key={`${item.id}-${item.enabled}`} />)
      )}
    </>
  );
});

export default SearchResult;
