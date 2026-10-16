import { MaximizeIcon } from 'lucide-react';
import { createElement, memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { remoteAvatarSrc } from '@/components/Avatar/fallback';
import ImperativeModal from '@/components/ImperativeModal';
import LobeThemeScope from '@/components/LobeThemeScope';
import { ModelIcon, ProviderIcon } from '@/components/OrviloIcons';
import StatisticCard from '@/components/StatisticCard';
import TitleWithPercentage from '@/components/StatisticCard/TitleWithPercentage';
import { Button } from '@/components/ui/button';
import { type UsageLog } from '@/types/usage/usageRecord';
import { formatNumber } from '@/utils/format';

import { type UsageChartProps } from '../../../../types';
import { GroupBy } from '../../../../types';
import ModelTable from './ModelTable';

const computeList = (data: UsageLog[], groupBy: GroupBy): string[] => {
  if (!data || data?.length === 0) return [];

  return Array.from(
    data.reduce((acc, log) => {
      if (log.records) {
        for (const item of log.records) {
          if (groupBy === GroupBy.Model && item.model?.length !== 0) {
            acc.add(item.model);
          }
          if (groupBy === GroupBy.Provider && item.provider?.length !== 0) {
            acc.add(item.provider);
          }
          if (groupBy === GroupBy.User && item.userId) {
            acc.add(item.userId);
          }
        }
      }
      return acc;
    }, new Set<string>()),
  );
};

const titleI18n = (
  groupBy: GroupBy,
): 'usage.activeModels.models' | 'usage.activeModels.providers' | 'usage.activeModels.users' => {
  if (groupBy === GroupBy.Model) return 'usage.activeModels.models';
  if (groupBy === GroupBy.Provider) return 'usage.activeModels.providers';
  return 'usage.activeModels.users';
};

const tableTitleI18n = (
  groupBy: GroupBy,
):
  | 'usage.activeModels.modelTable'
  | 'usage.activeModels.providerTable'
  | 'usage.activeModels.userTable' => {
  if (groupBy === GroupBy.Model) return 'usage.activeModels.modelTable';
  if (groupBy === GroupBy.Provider) return 'usage.activeModels.providerTable';
  return 'usage.activeModels.userTable';
};

const ActiveModels = memo<UsageChartProps>(({ data, isLoading, groupBy, resolveUser }) => {
  const { t } = useTranslation('auth');

  const [open, setOpen] = useState(false);

  const iconList = useMemo(
    () => computeList(data || [], groupBy || GroupBy.Model),
    [data, groupBy],
  );

  const renderIcon = (item: string, i: number) => {
    const baseStyle = {
      zIndex: i + 1,
    };
    if (groupBy === GroupBy.User) {
      const display = resolveUser?.(item);
      return (
        <Avatar
          avatar={remoteAvatarSrc(display?.avatar || display?.name || item) || undefined}
          background="var(--selected)"
          className="box-content -me-2 border-2 border-card"
          key={item}
          name={display?.name || item}
          shape={'circle'}
          size={18}
          style={baseStyle}
          title={display?.name || item}
        />
      );
    }
    return groupBy === GroupBy.Provider ? (
      <span
        className="inline-flex shrink-0 rounded-full box-content -me-2 border-2 border-card"
        key={item}
        style={baseStyle}
      >
        <ProviderIcon provider={item} size={18} />
      </span>
    ) : (
      <span
        className="inline-flex shrink-0 rounded-full box-content -me-2 border-2 border-card"
        key={item}
        style={baseStyle}
      >
        <ModelIcon model={item} size={18} />
      </span>
    );
  };

  return (
    <>
      <StatisticCard
        key={groupBy}
        loading={isLoading}
        title={<TitleWithPercentage title={t(titleI18n(groupBy ?? GroupBy.Model))} />}
        extra={
          <Button
            aria-label={t(tableTitleI18n(groupBy ?? GroupBy.Model))}
            size="icon"
            title={t(tableTitleI18n(groupBy ?? GroupBy.Model))}
            variant="ghost"
            onClick={() => setOpen(true)}
          >
            {createElement(MaximizeIcon)}
          </Button>
        }
        statistic={{
          description: (
            <div className="flex min-w-0 flex-wrap">
              {iconList.map((item, i) => {
                if (!item) return null;
                return renderIcon(item, i);
              })}
            </div>
          ),
          precision: 0,
          value: formatNumber(iconList?.length ?? 0),
        }}
      />
      <ImperativeModal
        footer={null}
        open={open}
        title={t(tableTitleI18n(groupBy ?? GroupBy.Model))}
        onCancel={() => setOpen(false)}
      >
        <LobeThemeScope>
          <ModelTable
            data={data}
            groupBy={groupBy}
            isLoading={isLoading}
            resolveUser={resolveUser}
          />
        </LobeThemeScope>
      </ImperativeModal>
    </>
  );
});

export default ActiveModels;
