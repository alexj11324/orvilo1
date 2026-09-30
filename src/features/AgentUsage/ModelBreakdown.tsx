'use client';

import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon } from '@/components/OrviloIcons';
import { Spinner } from '@/components/ui/spinner';
import { type AgentUsageModelRow } from '@/types/usage/usageRecord';
import { formatNumber, formatUsageValue } from '@/utils/format';

interface ModelBreakdownProps {
  isLoading?: boolean;
  rows: AgentUsageModelRow[];
}

const ModelBreakdown = memo<ModelBreakdownProps>(({ rows, isLoading }) => {
  const { t } = useTranslation('spend');

  return (
    <div className="flex flex-col gap-4">
      <Text fontSize={16} weight={500}>
        {t('usageStats.breakdown.title')}
      </Text>
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ paddingBlock: 24 }}>
          <Spinner />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="py-2 text-left font-medium">{t('usageStats.breakdown.model')}</th>
              <th className="py-2 text-right font-medium">{t('usageStats.breakdown.requests')}</th>
              <th className="py-2 text-right font-medium">
                {t('usageStats.breakdown.totalTokens')}
              </th>
              <th className="py-2 text-right font-medium">{t('usageStats.breakdown.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr className="border-border border-b last:border-0" key={record.id}>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <ModelIcon model={record.model} size={20} />
                    <div className="flex flex-col">
                      <Text ellipsis>{record.model}</Text>
                      <Text fontSize={12} type={'secondary'}>
                        {record.provider}
                      </Text>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right">{formatNumber(record.requests)}</td>
                <td className="py-2 text-right">{formatUsageValue(record.totalTokens)}</td>
                <td className="py-2 text-right">${formatNumber(record.cost, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});

export default ModelBreakdown;
