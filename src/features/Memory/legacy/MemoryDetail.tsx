import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-row justify-between w-full">
        <div className="font-bold text-foreground">{data?.title || t('manager.details')}</div>
        <Button
          className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
          variant="outline"
          onClick={onClose}
        >
          {t('manager.close')}
        </Button>
      </div>
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
    </div>
  );
}
