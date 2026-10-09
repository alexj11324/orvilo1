import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { automationResultDeliveryService } from '@/services/automationResultDelivery';
import { useAutomationResultsStore } from '@/store/automationResults';

import RunStatusBadge from './RunStatusBadge';

export default function ResultDeliveryList({
  taskId,
  readOnly = false,
}: {
  taskId: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('automation');
  const useFetchResults = useAutomationResultsStore((s) => s.useFetchResults);
  const results = useFetchResults(taskId);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, unknown>>({});

  const retry = async (id: string) => {
    if (readOnly) return;
    setPending((current) => ({ ...current, [id]: true }));
    setErrors((current) => ({ ...current, [id]: undefined }));
    try {
      await automationResultDeliveryService.retry(id, Boolean(acknowledged[id]));
      await results.mutate();
    } catch (error) {
      setErrors((current) => ({ ...current, [id]: error }));
    } finally {
      setPending((current) => ({ ...current, [id]: false }));
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('result.historyTitle')}</h3>
      <AsyncBoundary
        data={results.data}
        empty={<p className="text-sm text-muted-foreground">{t('result.empty')}</p>}
        error={results.error}
        isEmpty={results.data?.length === 0}
        isLoading={results.isLoading}
        onRetry={() => void results.mutate()}
      >
        {results.data?.map((row) => (
          <div className="flex flex-col gap-2 border-b border-border pb-3 text-sm" key={row.id}>
            <div className="flex items-center gap-2">
              <RunStatusBadge
                hint={t(`result.run.${row.payload.status}`)}
                status={
                  row.payload.status === 'succeeded'
                    ? 'completed'
                    : row.payload.status === 'canceled' || row.payload.status === 'unknown'
                      ? 'skipped'
                      : 'failed'
                }
              />
              <span className="text-xs text-muted-foreground">{row.payload.stopReason}</span>
            </div>
            <span>
              {row.destinationId === 'inbox' ? t('result.inbox') : t('result.webhook')} ·{' '}
              {t(`result.delivery.${row.status}`)}
            </span>
            <time className="text-xs text-muted-foreground" dateTime={row.payload.completedAt}>
              {formatAbsoluteDateTime(row.payload.completedAt)}
            </time>
            <p className="whitespace-pre-wrap break-words">{row.payload.summary}</p>
            {row.error ? <span className="text-xs text-muted-foreground">{row.error}</span> : null}
            {row.status === 'unknown' ? (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={Boolean(acknowledged[row.id])}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    setAcknowledged((current) => ({ ...current, [row.id]: checked }))
                  }
                />
                {t('result.acknowledgeUnknown')}
              </label>
            ) : null}
            {row.destinationId !== 'inbox' && ['failed', 'unknown'].includes(row.status) ? (
              <div>
                <Button
                  disabled={readOnly || (row.status === 'unknown' && !acknowledged[row.id])}
                  loading={pending[row.id]}
                  size="sm"
                  variant="outline"
                  onClick={() => void retry(row.id)}
                >
                  {t('result.retryOutput')}
                </Button>
              </div>
            ) : null}
            {errors[row.id] ? <AsyncError error={errors[row.id]} variant="inline" /> : null}
          </div>
        ))}
      </AsyncBoundary>
    </section>
  );
}
