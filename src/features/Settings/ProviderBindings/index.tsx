import { Flexbox } from '@lobehub/ui';
import { Skeleton, Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';

import { ProviderCard } from './ProviderCard';
import { useProviderCatalog } from './useProviderCatalog';

const skeleton = (
  <Flexbox gap={16}>
    {['a', 'b', 'c'].map((key) => (
      <Skeleton height={72} key={key} radius={12} />
    ))}
  </Flexbox>
);

interface PageProps {
  showSettingHeader?: boolean;
}

const ProviderList = ({ generation, showSettingHeader }: PageProps & { generation: number }) => {
  const { t } = useTranslation('setting');
  const { data, error, isLoading, mutate } = useFetchProviderBindings();
  const { cards, error: catalogError, isLoading: catalogLoading } = useProviderCatalog();
  const bindings = useProviderBindingStore((s) => s.bindings);

  return (
    <Flexbox gap={24}>
      {showSettingHeader && (
        <SettingHeader description={t('providerBindings.description')} title={t('tab.provider')} />
      )}
      <AsyncBoundary
        data={data}
        empty={<Text type={'secondary'}>{t('providerBindings.empty')}</Text>}
        error={error ?? catalogError}
        isEmpty={cards.length === 0 && bindings.length === 0}
        isLoading={isLoading || catalogLoading}
        loading={skeleton}
        onRetry={() => void mutate()}
      >
        <Flexbox gap={16}>
          {cards.map((card) => (
            <ProviderCard card={card} generation={generation} key={card.id} />
          ))}
        </Flexbox>
      </AsyncBoundary>
    </Flexbox>
  );
};

const ProviderBindings = ({ showSettingHeader = true }: PageProps) => {
  const generation = useProviderBindingStore((s) => s.generation);
  return (
    <ProviderList generation={generation} key={generation} showSettingHeader={showSettingHeader} />
  );
};

export default ProviderBindings;
