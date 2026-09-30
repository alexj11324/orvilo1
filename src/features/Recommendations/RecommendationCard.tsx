import { cssVar, cx } from 'antd-style';
import { memo, type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import BriefCardSummary from '@/features/DailyBrief/BriefCardSummary';
import { styles as briefStyles } from '@/features/DailyBrief/style';
import { homeType } from '@/features/Home/components/homeType';

import { RECOMMENDATION_ICON_SIZE } from './iconSize';
import { styles } from './style';

interface RecommendationCardProps {
  /** Rail rendering: one scannable line, the CTA is the row itself. */
  compact?: boolean;
  ctaKey: string;
  descriptionKey: string;
  i18nValues?: Record<string, string>;
  /** Async handler for the primary CTA. */
  onAction: () => Promise<void>;
  renderIcon: (size: number) => ReactNode;
  tagKey?: string;
  titleKey: string;
}

export const RecommendationCard = memo<RecommendationCardProps>(
  ({ compact, ctaKey, descriptionKey, i18nValues, onAction, renderIcon, tagKey, titleKey }) => {
    const { t } = useTranslation('home');

    const [loading, setLoading] = useState(false);

    const title = t(titleKey, { defaultValue: '', ...i18nValues });
    const description = t(descriptionKey, { defaultValue: '', ...i18nValues });
    const ctaLabel = t(ctaKey, { defaultValue: '', ...i18nValues });
    const tagLabel = tagKey ? t(tagKey, { defaultValue: '', ...i18nValues }) : '';

    const handleClick = useCallback(async () => {
      if (loading) return;
      setLoading(true);
      try {
        await onAction();
      } catch (error) {
        console.error('[recommendations] action failed:', error);
        toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
      } finally {
        setLoading(false);
      }
    }, [loading, onAction, t]);

    if (compact)
      return (
        <Button
          className={styles.compactRow}
          loading={loading}
          variant="ghost"
          onClick={handleClick}
        >
          <div className="flex flex-row items-start gap-2.5" style={{ width: '100%' }}>
            <div className="flex flex-col flex-none py-[2px]">
              {renderIcon(RECOMMENDATION_ICON_SIZE.compact)}
            </div>
            <div
              className={cn(cx(homeType.itemTitleProse, styles.compactTitle))}
              style={{ flex: 1 }}
            >
              {title}
            </div>
          </div>
        </Button>
      );

    return (
      <div
        className={cx(briefStyles.card, styles.card)}
        style={{ borderRadius: cssVar.borderRadiusLG }}
        className={cx(
          briefStyles.card,
          styles.card,
          'rounded-md border bg-card flex flex-col gap-3 p-3',
        )}
      >
        <div className="flex flex-row items-center gap-4 justify-between">
          <div
            className="flex flex-row items-center gap-2"
            style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
          >
            {renderIcon(RECOMMENDATION_ICON_SIZE.regular)}
            <div className="truncate min-w-0 text-[16px] font-medium">{title}</div>
          </div>
        </div>
        <Separator className="border-dashed" style={{ marginBlock: 0 }} />
        {description.trim().length > 0 ? <BriefCardSummary summary={description} /> : null}
        <div className="flex flex-row items-center gap-2 justify-between flex-wrap">
          <div className="flex flex-row items-center gap-2">
            {tagLabel ? (
              <Badge size="sm" variant="outline">
                {tagLabel}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-row items-center gap-2">
            <Button
              className={briefStyles.actionBtnPrimary}
              className="rounded-full"
              loading={loading}
              onClick={handleClick}
            >
              {ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

RecommendationCard.displayName = 'RecommendationCard';
