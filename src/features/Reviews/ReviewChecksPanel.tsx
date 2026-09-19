import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  XCircleIcon,
} from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
  onLoadMore?: (cursor: string) => Promise<void> | void;
}>(({ checks, onLoadMore }) => {
  const { t } = useTranslation('common');
  const summary = checks.summary;
  const visual = checkSummaryVisual(summary.state);
  return (
    <Flexbox className={styles.card}>
      <Flexbox horizontal align={'center'} className={styles.cardHeader} gap={8}>
        <Text weight={500}>{t('reviews.checks')}</Text>
        <Text fontSize={12} type={'secondary'}>
          {t(visual.labelKey as never, { count: summary.failing })}
        </Text>
        <Flexbox flex={1} />
        <Text fontSize={12} type={'secondary'}>
          {checks.loaded}
          {checks.total !== null ? `/${checks.total}` : ''}
        </Text>
      </Flexbox>
      {checks.items.map((check, index) => {
        const icon = checkStatusVisual(check.status);
        return (
          <Flexbox className={styles.checkRow} key={`${check.name}-${index}`}>
            <Icon color={icon.color} icon={icon.icon} size={14} />
            <Text fontSize={13}>{check.name}</Text>
            <Text fontSize={12} type={'secondary'}>
              {check.rawConclusion ?? check.rawStatus ?? ''}
            </Text>
            {check.detailsUrl ? (
              <Text
                fontSize={12}
                style={{ cursor: 'pointer' }}
                type={'secondary'}
                onClick={() => window.open(check.detailsUrl!, '_blank', 'noopener,noreferrer')}
              >
                <Icon icon={ExternalLinkIcon} size={12} />
              </Text>
            ) : null}
          </Flexbox>
        );
      })}
      <CollectionFooter
        hasMore={checks.hasMore}
        loaded={checks.loaded}
        total={checks.total}
        onLoadMore={
          checks.endCursor && onLoadMore ? () => onLoadMore(checks.endCursor!) : undefined
        }
      />
    </Flexbox>
  );
});

ReviewChecksPanel.displayName = 'ReviewChecksPanel';

export default ReviewChecksPanel;
