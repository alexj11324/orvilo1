import { Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import DetailLoading from '@/routes/(main)/memory/features/DetailLoading';
import DetailNotFound from '@/routes/(main)/memory/features/DetailNotFound';
import HighlightedContent from '@/routes/(main)/memory/features/HighlightedContent';
import { useUserMemoryStore } from '@/store/userMemory';
import { type LayersEnum } from '@/types/userMemory';

export default function MemoryDetail({
  id,
  layer,
  onClose,
}: {
  id: string;
  layer: LayersEnum;
  onClose: () => void;
}) {
  const { t } = useTranslation('memory');
  const { data, error, isLoading, mutate } = useUserMemoryStore(
    (state) => state.useFetchMemoryDetail,
  )(id, layer);
  const fields = [
    'description',
    'narrative',
    'notes',
    'feedback',
    'keyLearning',
    'situation',
    'reasoning',
    'action',
    'possibleOutcome',
    'conclusionDirectives',
    'suggestions',
  ];
  return (
    <Flexbox gap={12}>
      <Flexbox horizontal justify={'space-between'}>
        <Text weight={'bold'}>{data?.title || t('manager.details')}</Text>
        <Button onClick={onClose}>{t('manager.close')}</Button>
      </Flexbox>
      <AsyncBoundary
        data={data}
        empty={<DetailNotFound />}
        error={error}
        isEmpty={!data}
        isLoading={isLoading}
        loading={<DetailLoading />}
        onRetry={() => void mutate()}
      >
        {fields
          .filter((field) => typeof data?.[field] === 'string' && data[field])
          .map((field) => (
            <HighlightedContent key={field}>{data[field]}</HighlightedContent>
          ))}
      </AsyncBoundary>
    </Flexbox>
  );
}
