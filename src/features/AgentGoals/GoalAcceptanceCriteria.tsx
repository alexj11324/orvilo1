'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useClientDataSWR } from '@/libs/swr';
import { verifyService } from '@/services/verify';

/** Historical criteria remain readable without changing their ledger bindings. */
const GoalAcceptanceCriteria = memo<{ criteriaIds: string[]; goalId: string }>(
  ({ criteriaIds, goalId }) => {
    const { t } = useTranslation('chat');
    const {
      data: criteria,
      error,
      mutate,
    } = useClientDataSWR(
      criteriaIds.length > 0 ? ['goal-acceptance-criteria', goalId, criteriaIds.join(',')] : null,
      () => verifyService.getCriteria(criteriaIds),
    );
    if (error) return <AsyncError error={error} variant="inline" onRetry={() => void mutate()} />;
    return (
      <div className="flex flex-col rounded-(--radius-card) border border-border px-4 py-1">
        {criteriaIds.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">{t('goalAcceptance.empty')}</div>
        )}
        {(criteria ?? []).map((item, index) => (
          <div className="flex items-center gap-2.5 py-2" key={item.id}>
            <span className="font-mono text-xs text-foreground-quaternary">C{index + 1}</span>
            <div className="font-medium">{item.title}</div>
          </div>
        ))}
      </div>
    );
  },
);
GoalAcceptanceCriteria.displayName = 'GoalAcceptanceCriteria';
export default GoalAcceptanceCriteria;
