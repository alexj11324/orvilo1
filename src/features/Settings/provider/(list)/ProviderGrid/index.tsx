'use client';

import isEqual from 'fast-deep-equal';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

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
  const [initAiProviderList] = useAiInfraStore((s) => [s.initAiProviderList]);
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
        <Section count={enabledList.length} title={t('list.title.enabled')}>
          {enabledList.map((item) => (
            <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
          ))}
        </Section>
        {disabledCustomList.length > 0 && (
          <Section count={disabledCustomList.length} title={t('list.title.custom')}>
            {disabledCustomList.map((item) => (
              <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
            ))}
          </Section>
        )}
        <Section count={disabledList.length} title={t('list.title.disabled')}>
          {disabledList.map((item) => (
            <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
          ))}
        </Section>
      </div>
    </AsyncBoundary>
  );
});

export default List;
