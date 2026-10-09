'use client';
import { ProviderIcon } from '@lobehub/ui/icons';
import dayjs from 'dayjs';
import { Brain, UserIcon } from 'lucide-react';
import { createElement, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import DatePicker, { type DatePickerProps } from '@/components/DatePicker';
import { FormGroup } from '@/components/GroupForm';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { useClientDataSWR } from '@/libs/swr';
import { statsKeys } from '@/libs/swr/keys';
import { usageService } from '@/services/usage';

import { UsageCards, UsageTable, UsageTrends } from './features/usage';
import { GroupBy, type UserDisplayResolver } from './types';

interface StatsSettingProps {
  /**
   * Enable the "By User" group-by dimension in the Usage section. Only
   * meaningful when multiple users contribute to the data (i.e. workspace
   * mode). Combine with `resolveUser` to render names instead of opaque IDs.
   */
  enableUserDimension?: boolean;
  /** Resolve userId → display info. Required when `enableUserDimension` is true. */
  resolveUser?: UserDisplayResolver;
  /** Render the standard personal-settings title and divider. */
  showSettingHeader?: boolean;
}

const StatsSetting = memo<StatsSettingProps>(
  ({ enableUserDimension, resolveUser, showSettingHeader = true }) => {
    const { t, i18n } = useTranslation('auth');
    dayjs.locale(i18n.language);

    const [groupBy, setGroupBy] = useState<GroupBy>(GroupBy.Model);
    const [dateRange, setDateRange] = useState<dayjs.Dayjs>(() => dayjs(new Date()));
    const [dateStrings, setDateStrings] = useState<string>();

    const { data, isLoading, error, mutate } = useClientDataSWR(statsKeys.usageStat(), async () =>
      usageService.findAndGroupByDay(dateStrings),
    );

    useEffect(() => {
      if (dateStrings) {
        mutate();
      }
    }, [dateStrings, mutate]);

    const handleDateChange: DatePickerProps['onChange'] = (dates) => {
      // Handle both single date and array
      const actualDate = Array.isArray(dates) ? dates[0] : dates;
      if (actualDate) {
        setDateRange(actualDate);
        setDateStrings(actualDate.format('YYYY-MM'));
      }
    };

    return (
      <>
        {showSettingHeader && <SettingHeader title={t('tab.stats')} />}
        <FormGroup
          collapsible={false}
          gap={16}
          title={t('tab.usage')}
          variant={'filled'}
          extra={
            <>
              <DatePicker
                className="w-36 flex-none"
                format="YYYY/MM"
                picker="month"
                value={dateRange}
                onChange={handleDateChange}
              />
              <Tabs
                style={{ marginLeft: 8 }}
                value={groupBy}
                onValueChange={(key) => setGroupBy(key as GroupBy)}
              >
                <TabsList>
                  {[
                    {
                      icon: createElement(Brain, {}),
                      key: GroupBy.Model,
                      label: t('usage.welcome.model'),
                    },
                    {
                      icon: createElement(ProviderIcon, {}),
                      key: GroupBy.Provider,
                      label: t('usage.welcome.provider'),
                    },
                    ...(enableUserDimension
                      ? [
                          {
                            icon: createElement(UserIcon, {}),
                            key: GroupBy.User,
                            label: t('usage.welcome.user'),
                          },
                        ]
                      : []),
                  ].map((item) => (
                    <TabsTrigger key={item.key} value={item.key}>
                      {item.icon}
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </>
          }
          styles={{
            title: { lineHeight: '35px' },
          }}
        >
          <AsyncBoundary data={data} error={error} errorVariant={'block'} onRetry={() => mutate()}>
            <UsageCards
              data={data}
              groupBy={groupBy}
              isLoading={isLoading}
              resolveUser={resolveUser}
            />
            <Separator />
            <UsageTrends
              data={data}
              groupBy={groupBy}
              isLoading={isLoading}
              resolveUser={resolveUser}
            />
          </AsyncBoundary>
          <div style={{ height: 24 }} />
          <UsageTable dateStrings={dateStrings} />
        </FormGroup>
      </>
    );
  },
);

export default StatsSetting;
