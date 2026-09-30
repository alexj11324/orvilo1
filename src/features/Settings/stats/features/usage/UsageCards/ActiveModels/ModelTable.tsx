import { CategoryBar, useThemeColorRange } from '@lobehub/charts';
import { cssVar } from 'antd-style';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { remoteAvatarSrc } from '@/components/Avatar/fallback';
import InlineTable from '@/components/InlineTable';
import { ModelIcon, ProviderIcon } from '@/components/OrviloIcons';
import { Badge } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { type UsageLog, type UsageRecordItem } from '@/types/usage/usageRecord';
import { formatPrice } from '@/utils/format';

import { type UsageChartProps } from '../../../../types';
import { GroupBy } from '../../../../types';

interface WeightGroup {
  id: string;
  spend: number | string;
  weight: number;
}

// Outer grouping key (top-level rows). For User mode, group by userId.
const outerKey = (log: UsageRecordItem, groupBy: GroupBy): string => {
  if (groupBy === GroupBy.Model) return log.model;
  if (groupBy === GroupBy.Provider) return log.provider;
  return log.userId;
};

// Inner grouping key (sub-rows). For Model→Provider, Provider→Model, User→Model.
const innerKey = (log: UsageRecordItem, groupBy: GroupBy): string => {
  if (groupBy === GroupBy.Model) return log.provider;
  return log.model;
};

const formatData = (
  data: UsageLog[],
  groupBy: GroupBy,
): {
  childrens: WeightGroup[];
  id: string;
  totalSpend: number;
}[] => {
  if (!data || data?.length === 0) return [];

  const requestLogs = data.flatMap((log) => log.records);
  const groupedLogs = requestLogs.reduce((acc, log) => {
    const key = outerKey(log, groupBy);
    if (!acc.has(key)) {
      acc.set(key, []);
    }
    acc.get(key)?.push(log);
    return acc;
  }, new Map<string, UsageLog['records']>());

  return Array.from(groupedLogs.entries())
    .map(([key, logs]) => {
      // The logs here span multiple days and need to be summed
      // If the current groupBy is Model, logs should be grouped by Provider
      const spend = logs.reduce((acc, log) => {
        const key = innerKey(log, groupBy);
        acc.set(key, (acc.get(key) || 0) + log.spend);
        return acc;
      }, new Map<string, number>());

      const totalSpend = logs.reduce((total, log) => total + (log.spend || 0), 0);

      const spendWithWeight = Array.from(
        spend.entries().map(([key, value]) => {
          return {
            id: key,
            spend: value,
            weight: totalSpend > 0 ? value / totalSpend : 0,
          };
        }),
      );

      return {
        childrens: spendWithWeight.sort((a, b) => b.weight - a.weight),
        id: key,
        totalSpend,
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);
};

const ModelTable = memo<UsageChartProps>(({ data, isLoading, groupBy, resolveUser }) => {
  const { t } = useTranslation('auth');
  const themeColorRange = useThemeColorRange();

  const formattedData = useMemo(
    () => formatData(data || [], groupBy || GroupBy.Model),
    [data, groupBy],
  );

  // Sub-row column shows the "other" dimension. For Model→Provider,
  // Provider→Model, and User→Model.
  const innerColumnKey =
    (groupBy ?? GroupBy.Model) === GroupBy.Model
      ? 'usage.activeModels.table.provider'
      : 'usage.activeModels.table.model';

  const renderInnerIcon = (id: string, color: string) => {
    const baseStyle = {
      boxShadow: `0 0 0 2px ${cssVar.colorBgContainer}, 0 0 0 4px ${color}`,
      boxSizing: 'content-box' as const,
    };
    return (groupBy ?? GroupBy.Model) === GroupBy.Provider ? (
      <ProviderIcon provider={id} style={baseStyle} />
    ) : (
      <ModelIcon model={id} style={baseStyle} />
    );
  };

  const renderOuterLabel = (key: string) => {
    if (groupBy === GroupBy.User) {
      const display = resolveUser?.(key);
      return (
        <div
          className={'flex min-w-0'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Avatar
            avatar={remoteAvatarSrc(display?.avatar || display?.name || key) || undefined}
            background={cssVar.colorFillSecondary}
            name={display?.name || key}
            shape={'circle'}
            size={24}
            title={display?.name || key}
          />
          {display?.name || key}
        </div>
      );
    }
    return (
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {groupBy === GroupBy.Provider ? (
          <ProviderIcon provider={key} size={24} />
        ) : (
          <ModelIcon model={key} size={24} />
        )}
        {key}
      </div>
    );
  };

  return isLoading ? (
    <div aria-busy="true" className="flex flex-col gap-3">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton className="h-4 w-full" key={index} />
      ))}
    </div>
  ) : (
    <Accordion multiple defaultValue={formattedData.map((item) => item.id)}>
      {formattedData.map((item) => {
        const key = item.id;
        return (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger>
              <div className="flex min-w-0 items-center gap-2">
                {renderOuterLabel(key)}
                <Badge>{item.childrens.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {
                <div className={'flex min-w-0'} style={{ flexDirection: 'column' }}>
                  <CategoryBar
                    colors={themeColorRange}
                    showLabels={false}
                    size={2}
                    values={item.childrens.map((item) => item.weight)}
                  />
                  <InlineTable
                    dataSource={item.childrens}
                    hoverToActive={false}
                    loading={isLoading}
                    rowKey={(record) => record.id}
                    columns={[
                      {
                        dataIndex: 'id',
                        key: 'id',
                        render: (value, record, index) => {
                          return (
                            <div
                              className={'flex min-w-0'}
                              key={value}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                            >
                              {renderInnerIcon(record.id, themeColorRange[index])}
                              {value}
                            </div>
                          );
                        },
                        title: t(innerColumnKey),
                        width: 200,
                      },
                      {
                        dataIndex: 'spend',
                        key: 'spend',
                        render: (value) => {
                          return `$${formatPrice(value)}`;
                        },
                        title: t('usage.activeModels.table.spend'),
                      },
                    ]}
                  />
                </div>
              }
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
});

export default ModelTable;
