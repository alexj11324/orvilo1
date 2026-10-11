import type { WorkVersionItem } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { formatTaskItemDate } from '@/features/AgentTasks/features/formatTaskItemDate';
import { useClientDataSWR } from '@/libs/swr';
import { workKeys } from '@/libs/swr/keys';
import { workService } from '@/services/work';
import { computeWorkVersionCostDeltas, formatWorkVersionCost } from '@/utils/workVersionCost';

const styles = {
  context: 'shrink-0 text-foreground-tertiary text-xs leading-5',
  error: 'py-2 ps-9 pe-2 text-sm leading-5.5 text-destructive-text',
  versionCost: 'text-foreground-tertiary text-xs leading-5',
  versionList: 'ms-8 pbs-1.5 pbe-2.5 border-bs border-divider',
  versionRow: 'py-1.5 text-xs leading-5',
  versionTitle: 'text-muted-foreground text-sm leading-5.5',
};

const VersionList = memo<{ workId: string }>(({ workId }) => {
  const { i18n, t } = useTranslation(['chat', 'common']);
  const {
    data = [],
    error,
    isLoading,
  } = useClientDataSWR<WorkVersionItem[]>(
    workKeys.versions(workId),
    () => workService.listVersions(workId),
    {
      fallbackData: [],
      revalidateOnFocus: false,
    },
  );

  if (isLoading) {
    return (
      <div className="flex h-14 flex-col items-center justify-center">
        <NeuralNetworkLoading size={18} />
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>{t('workingPanel.works.versionError')}</div>;
  }

  if (data.length === 0) {
    return (
      <div className={cn('flex flex-col', styles.versionList)}>
        <div className="text-sm leading-5.5 text-muted-foreground">
          {t('workingPanel.works.emptyVersions')}
        </div>
      </div>
    );
  }

  // cumulativeCost is a per-operation running snapshot; diff it so each row
  // shows the version's own spend and the rows visibly sum to the card total.
  const costDeltas = computeWorkVersionCostDeltas(data);

  return (
    <div className={cn('flex flex-col', styles.versionList)}>
      {data.map((version) => {
        const cost = formatWorkVersionCost(costDeltas.get(version.id));
        const time = formatTaskItemDate(version.createdAt, {
          formatOtherYear: t('time.formatOtherYear', { ns: 'common' }),
          formatThisYear: t('time.formatThisYear', { ns: 'common' }),
          locale: i18n.language,
        });

        return (
          <div className={cn('flex flex-col gap-1', styles.versionRow)} key={version.id}>
            <div className="flex items-center gap-2 justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <div className="font-mono rounded-(--radius-chip) bg-muted px-1 text-xs leading-5">
                  v{version.version}
                </div>
                <div className={cn('truncate', styles.versionTitle)}>
                  {t(`workingPanel.works.changeType.${version.changeType}` as never)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {cost && (
                  <div
                    title={t('workingPanel.works.versionCost', { cost })}
                    className={cn(
                      'font-mono rounded-(--radius-chip) bg-muted px-1 text-xs leading-5',
                      styles.versionCost,
                    )}
                  >
                    {cost}
                  </div>
                )}
                {time && <div className={cn('text-muted-foreground', styles.context)}>{time}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

VersionList.displayName = 'VersionList';

export default VersionList;
