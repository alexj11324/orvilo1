import type { WorkVersionItem } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { formatTaskItemDate } from '@/features/AgentTasks/features/formatTaskItemDate';
import { useClientDataSWR } from '@/libs/swr';
import { workKeys } from '@/libs/swr/keys';
import { workService } from '@/services/work';
import { computeWorkVersionCostDeltas, formatWorkVersionCost } from '@/utils/workVersionCost';

const styles = createStaticStyles(({ css, cssVar }) => ({
  context: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  error: css`
    padding-block: 8px;
    padding-inline: 36px 8px;
    color: ${cssVar.colorError};
  `,
  versionCost: css`
    color: ${cssVar.colorTextTertiary};
  `,
  versionList: css`
    margin-inline-start: 34px;
    padding-block: 6px 10px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  versionRow: css`
    padding-block: 6px;
    font-size: 12px;
  `,
  versionTitle: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

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
      <div className="flex flex-col items-center justify-center" style={{ height: 56 }}>
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
        <div className="text-muted-foreground">{t('workingPanel.works.emptyVersions')}</div>
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
              <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                <div className="font-mono rounded bg-muted px-1 text-[12px]">
                  v{version.version}
                </div>
                <div className="truncate styles.versionTitle">
                  {t(`workingPanel.works.changeType.${version.changeType}` as never)}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                {cost && (
                  <div
                    className="font-mono rounded bg-muted px-1 text-[12px] styles.versionCost"
                    title={t('workingPanel.works.versionCost', { cost })}
                  >
                    {cost}
                  </div>
                )}
                {time && <div className="text-muted-foreground styles.context">{time}</div>}
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
