'use client';

import isEqual from 'fast-deep-equal';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiInfraStore } from '@/store/aiInfra';

import ProviderItem from './Item';

const SearchResult = memo((props: { onProviderSelect?: (key: string) => void }) => {
  const { onProviderSelect = () => {} } = props;
  const { t } = useTranslation('modelProvider');

  const searchKeyword = useAiInfraStore((s) => s.providerSearchKeyword);
  const aiProviderList = useAiInfraStore((s) => s.aiProviderList, isEqual);

  // Use useMemo to optimize filtering performance
  const filteredProviders = useMemo(() => {
    const keyword = searchKeyword.toLowerCase().trim();

    return aiProviderList.filter(
      (provider) =>
        provider.id.toLowerCase().includes(keyword) ||
        provider.name?.toLowerCase().includes(keyword) ||
        provider.description?.toLowerCase().includes(keyword),
    );
  }, [aiProviderList, searchKeyword]);

  return (
    <div className="flex flex-col px-2 pb-8">
      {searchKeyword && filteredProviders.length === 0 ? (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          {t('menu.notFound')}
        </div>
      ) : (
        filteredProviders.map((item) => (
          <ProviderItem {...item} key={item.id} onClick={onProviderSelect} />
        ))
      )}
    </div>
  );
});

export default SearchResult;
