'use client';

import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SearchBar from '@/components/SearchBar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useAiInfraStore } from '@/store/aiInfra/store';

import AddNew from './AddNew';
import ProviderList from './List';
import SearchResult from './SearchResult';

interface ProviderMenuProps {
  children: ReactNode;
  mobile?: boolean;
}
const Layout = memo(({ children, mobile }: ProviderMenuProps) => {
  const { t } = useTranslation('modelProvider');

  const providerSearchKeyword = useAiInfraStore((s) => s.providerSearchKeyword);

  return (
    <aside
      aria-label={t('menu.searchProviders')}
      className={cn(
        'flex flex-col bg-background',
        !mobile && 'w-[264px] min-w-[264px] overflow-y-auto border-r border-border',
      )}
    >
      <div className="sticky top-0 z-10 flex gap-2 bg-background px-3 pt-3 pb-2">
        <SearchBar
          className="flex-1"
          placeholder={t('menu.searchProviders')}
          value={providerSearchKeyword}
          onChange={(e) => {
            useAiInfraStore.setState({ providerSearchKeyword: e.target.value });
          }}
        />
        <AddNew />
      </div>
      {children}
    </aside>
  );
});

const ProviderMenu = ({
  mobile,
  onProviderSelect = () => {},
}: {
  mobile?: boolean;
  onProviderSelect?: (providerKey: string) => void;
}) => {
  const [initAiProviderList, providerSearchKeyword, useFetchAiProviderList] = useAiInfraStore(
    (s) => [s.initAiProviderList, s.providerSearchKeyword, s.useFetchAiProviderList],
  );

  // Own the provider-list fetch here so a failed load surfaces error + Retry
  // instead of a permanent skeleton — `initAiProviderList` only flips on success
  //
  const { error, mutate } = useFetchAiProviderList();

  // Search overrides everything (matches prior behavior); otherwise gate the
  // list on load/error via AsyncBoundary.
  const Content = providerSearchKeyword ? (
    <SearchResult onProviderSelect={onProviderSelect} />
  ) : (
    <AsyncBoundary
      data={initAiProviderList ? true : undefined}
      error={error}
      errorVariant={'page'}
      isLoading={!initAiProviderList && !error}
      loading={<SkeletonList />}
      onRetry={() => mutate()}
    >
      <ProviderList mobile={mobile} onProviderSelect={onProviderSelect} />
    </AsyncBoundary>
  );

  return <Layout mobile={mobile}>{Content}</Layout>;
};

export default ProviderMenu;
