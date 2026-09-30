import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  XCircleIcon,
} from 'lucide-react';
import { createElement, memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';

import CollectionFooter from './CollectionFooter';
import type { CheckSummary, NormalizedCheckItem, PullRequestCollection } from './types';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  checkRow: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 12px;
  `,
}));

export const checkStatusVisual = (status: NormalizedCheckItem['status']) => {
  switch (status) {
    case 'passed': {
      return { color: cssVar.colorSuccess, icon: CheckCircle2Icon };
    }
    case 'failing': {
      return { color: cssVar.colorError, icon: XCircleIcon };
    }
    case 'pending': {
      return { color: cssVar.colorWarning, icon: CircleDashedIcon };
    }
    default: {
      return { color: cssVar.colorTextTertiary, icon: CircleHelpIcon };
    }
  }
};

export const checkSummaryVisual = (
  state: CheckSummary['state'],
): { color: string; labelKey: string } => {
  switch (state) {
    case 'passed': {
      return { color: cssVar.colorSuccess, labelKey: 'reviews.checksPassing' };
    }
    case 'failing': {
      return { color: cssVar.colorError, labelKey: 'reviews.checksFailing_other' };
    }
    case 'pending': {
      return { color: cssVar.colorWarning, labelKey: 'reviews.checksPending' };
    }
    case 'partial': {
      return { color: cssVar.colorWarning, labelKey: 'reviews.checksPartial' };
    }
    default: {
      return { color: cssVar.colorTextTertiary, labelKey: 'reviews.checksUnknown' };
    }
  }
};

/**
 * Check list with the server-aggregated summary — "not yet failed" never
 * renders as "passed", and a partially-loaded rollup is always marked.
 */
const ReviewChecksPanel = memo<{
  checks: PullRequestCollection<NormalizedCheckItem> & { summary: CheckSummary };
  onLoadMore?: (cursor: string) => Promise<void>;
}>(({ checks, onLoadMore }) => {
  const { t } = useTranslation('common');
  const checksMore = usePagedLoadMore();
  const checksEndCursor = checks.endCursor;
  useEffect(() => {
    checksMore.resetLoadMoreError();
  }, [checksEndCursor, checksMore.resetLoadMoreError]);
  const summary = checks.summary;
  const visual = checkSummaryVisual(summary.state);
  return (
    <div className={cx('flex flex-col', styles.card)}>
      <div className={cx('flex items-center gap-2', styles.cardHeader)}>
        <div className="font-medium">{t('reviews.checks')}</div>
        <div className="text-[12px] text-muted-foreground">
          {t(visual.labelKey as never, { count: summary.failing })}
        </div>
        <div className="flex-1" />
        <div className="text-[12px] text-muted-foreground">
          {checks.loaded}
          {checks.total !== null ? `/${checks.total}` : ''}
        </div>
      </div>
      {checks.items.map((check, index) => {
        const icon = checkStatusVisual(check.status);
        return (
          <div className={styles.checkRow} key={`${check.name}-${index}`}>
            {createElement(icon.icon, { color: icon.color, size: 14 })}
            <div className="text-[13px]">{check.name}</div>
            <div className="text-[12px] text-muted-foreground">
              {check.rawConclusion ?? check.rawStatus ?? ''}
            </div>
            {check.detailsUrl ? (
              <div
                className="text-[12px] text-muted-foreground"
                style={{ cursor: 'pointer' }}
                onClick={() => window.open(check.detailsUrl!, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLinkIcon size={12} />
              </div>
            ) : null}
          </div>
        );
      })}
      <CollectionFooter
        error={checksMore.loadMoreError}
        hasMore={checks.hasMore}
        loaded={checks.loaded}
        total={checks.total}
        onRetry={checksMore.retryLoadMore}
        onLoadMore={
          checks.endCursor && onLoadMore
            ? () => checksMore.runLoadMore(() => onLoadMore(checks.endCursor!))
            : undefined
        }
      />
    </div>
  );
});

ReviewChecksPanel.displayName = 'ReviewChecksPanel';

export default ReviewChecksPanel;
