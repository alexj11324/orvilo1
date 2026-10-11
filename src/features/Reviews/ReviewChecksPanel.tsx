import { clsx } from 'cn';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  XCircleIcon,
} from 'lucide-react';
import { createElement, memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';

import CollectionFooter from './CollectionFooter';
import type { CheckSummary, NormalizedCheckItem, PullRequestCollection } from './types';

const styles = {
  card: 'overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  cardHeader:
    'flex items-center gap-2 [border-block-end:1px_solid_var(--divider)] bg-fill-quaternary px-4 py-2',
  checkRow: 'flex items-center gap-2 px-4 py-1.5',
} as const;

export const checkStatusVisual = (status: NormalizedCheckItem['status']) => {
  switch (status) {
    case 'passed': {
      return { color: 'var(--success-text)', icon: CheckCircle2Icon };
    }
    case 'failing': {
      return { color: 'var(--destructive-text)', icon: XCircleIcon };
    }
    case 'pending': {
      return { color: 'var(--warning-text)', icon: CircleDashedIcon };
    }
    default: {
      return { color: 'var(--foreground-tertiary)', icon: CircleHelpIcon };
    }
  }
};

export const checkSummaryVisual = (
  state: CheckSummary['state'],
): { color: string; labelKey: string } => {
  switch (state) {
    case 'passed': {
      return { color: 'var(--success-text)', labelKey: 'reviews.checksPassing' };
    }
    case 'failing': {
      return { color: 'var(--destructive-text)', labelKey: 'reviews.checksFailing_other' };
    }
    case 'pending': {
      return { color: 'var(--warning-text)', labelKey: 'reviews.checksPending' };
    }
    case 'partial': {
      return { color: 'var(--warning-text)', labelKey: 'reviews.checksPartial' };
    }
    default: {
      return { color: 'var(--foreground-tertiary)', labelKey: 'reviews.checksUnknown' };
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
  const { resetLoadMoreError } = checksMore;
  const checksEndCursor = checks.endCursor;
  useEffect(() => {
    resetLoadMoreError();
  }, [checksEndCursor, resetLoadMoreError]);
  const summary = checks.summary;
  const visual = checkSummaryVisual(summary.state);
  return (
    <div className={clsx('flex flex-col', styles.card)}>
      <div className={clsx('flex items-center gap-2', styles.cardHeader)}>
        <div className="text-sm leading-5.5 font-semibold">{t('reviews.checks')}</div>
        <div className="text-xs text-muted-foreground">
          {t(visual.labelKey as never, { count: summary.failing })}
        </div>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          {checks.loaded}
          {checks.total !== null ? `/${checks.total}` : ''}
        </div>
      </div>
      {checks.items.map((check, index) => {
        const icon = checkStatusVisual(check.status);
        return (
          <div className={styles.checkRow} key={`${check.name}-${index}`}>
            {createElement(icon.icon, { color: icon.color, size: 16 })}
            <div className="text-sm leading-5.5">{check.name}</div>
            <div className="text-xs text-muted-foreground">
              {check.rawConclusion ?? check.rawStatus ?? ''}
            </div>
            {check.detailsUrl ? (
              <Button
                aria-label={check.name}
                className="text-muted-foreground"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => window.open(check.detailsUrl!, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLinkIcon size={16} />
              </Button>
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
