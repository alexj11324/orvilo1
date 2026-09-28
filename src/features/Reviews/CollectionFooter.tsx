import { Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';

const styles = createStaticStyles(({ css }) => ({
  footer: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    padding-block: 6px;
    padding-inline: 12px;
    border-block-start: 1px dashed ${cssVar.colorBorderSecondary};
  `,
}));

/**
 * Collection completeness footer — a partially-loaded collection is always
 * visible as such, with an on-demand Load more. `stale` marks a page whose
 * server response saw a newer head than the loaded snapshot.
 */
const CollectionFooter = memo<{
  /** Rejection from the last `onLoadMore` — replaces the row with a retry. */
  error?: unknown;
  hasMore: boolean;
  loaded: number;
  loading?: boolean;
  stale?: boolean;
  total: number | null;
  onLoadMore?: () => void;
  /** Re-issues the failed page request shown by `error`. */
  onRetry?: () => void;
}>(({ error, hasMore, loaded, loading, onLoadMore, onRetry, stale, total }) => {
  const { t } = useTranslation('common');
  if (!error && !hasMore && !stale && (total === null || loaded === total)) return null;
  return (
    <Flexbox className={styles.footer}>
      {error ? (
        <AsyncError error={error} variant={'inline'} onRetry={onRetry} />
      ) : (
        <>
          <Text fontSize={12} type={'secondary'}>
            {stale
              ? t('reviews.staleBanner')
              : t('reviews.loadedCount', { loaded, total: total ?? '…' })}
          </Text>
          {hasMore && !stale ? (
            <Button loading={loading} size={'small'} type={'text'} onClick={onLoadMore}>
              {t('myWork.loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </Flexbox>
  );
});

CollectionFooter.displayName = 'CollectionFooter';

export default CollectionFooter;
