'use client';

import isEqual from 'fast-deep-equal';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

import { filterProviders } from '../../features/filterProviders';
import Card from './Card';

const loadingArr = Array.from({ length: 12 })
  .fill('-')
  .map((item, index) => `${index}x${item}`);

const GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3';

type ListProps = {
  onProviderSelect: (provider: string) => void;
};

const Section = ({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count?: number;
  title: string;
}) => (
  <section className="mt-6 first:mt-0">
    <div className="mb-2 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </div>
    <div className={GRID_CLASS}>{children}</div>
  </section>
);

const List = memo((props: ListProps) => {
  const { onProviderSelect } = props;
  const { t } = useTranslation('modelProvider');
  const { t: tSetting } = useTranslation('setting');
  const enabledList = useAiInfraStore(aiProviderSelectors.enabledAiProviderList, isEqual);
  const disabledList = useAiInfraStore(aiProviderSelectors.disabledAiProviderList, isEqual);
  const disabledCustomList = useAiInfraStore(
    aiProviderSelectors.disabledCustomAiProviderList,
    isEqual,
  );
  const [initAiProviderList, searchKeyword] = useAiInfraStore((s) => [
    s.initAiProviderList,
    s.providerSearchKeyword,
  ]);
  // The rail search drives this grid too, with the same match rule.
  const visibleEnabled = useMemo(
    () => filterProviders(enabledList, searchKeyword),
    [enabledList, searchKeyword],
  );
  const visibleCustom = useMemo(
    () => filterProviders(disabledCustomList, searchKeyword),
    [disabledCustomList, searchKeyword],
  );
  const visibleDisabled = useMemo(
    () => filterProviders(disabledList, searchKeyword),
    [disabledList, searchKeyword],
  );
  const hasResults = visibleEnabled.length + visibleCustom.length + visibleDisabled.length > 0;
  // Own the same list fetch (SWR-deduped with ProviderMenu) so a failed load
  // shows error + Retry here too, instead of a permanent skeleton grid
  // (`initAiProviderList` only flips on success).
  const useFetchAiProviderList = useAiInfraStore((s) => s.useFetchAiProviderList);
  const { error, mutate } = useFetchAiProviderList();

  const header = (
    <header className="mb-4">
      <h1 className="text-xl leading-7 font-semibold">{tSetting('tab.provider')}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{t('list.header.desc')}</p>
    </header>
  );

  const skeleton = (
    <div>
      {header}
      <Section title={t('list.title.enabled')}>
        {loadingArr.map((item) => (
          <Card
            loading
            enabled={false}
            id={item}
            key={item}
            source={'builtin'}
            onProviderSelect={onProviderSelect}
          />
        ))}
      </Section>
    </div>
  );

  return (
    <AsyncBoundary
      data={initAiProviderList ? true : undefined}
      error={error}
      errorVariant={'page'}
      isLoading={!initAiProviderList && !error}
      loading={skeleton}
      onRetry={() => mutate()}
    >
      <div>
        {header}
        {hasResults ? (
          <>
            {visibleEnabled.length > 0 && (
              <Section count={visibleEnabled.length} title={t('list.title.enabled')}>
                {visibleEnabled.map((item) => (
                  <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
                ))}
              </Section>
            )}
            {visibleCustom.length > 0 && (
              <Section count={visibleCustom.length} title={t('list.title.custom')}>
                {visibleCustom.map((item) => (
                  <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
                ))}
              </Section>
            )}
            {visibleDisabled.length > 0 && (
              <Section count={visibleDisabled.length} title={t('list.title.disabled')}>
                {visibleDisabled.map((item) => (
                  <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
                ))}
              </Section>
            )}
          </>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground" role="status">
            {t('menu.notFound')}
          </p>
        )}
      </div>
    </AsyncBoundary>
  );
});

export default List;
