import { Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
  hasMore: boolean;
  loaded: number;
  loading?: boolean;
  stale?: boolean;
  total: number | null;
  onLoadMore?: () => void;
}>(({ hasMore, loaded, loading, onLoadMore, stale, total }) => {
  const { t } = useTranslation('common');
  if (!hasMore && !stale && (total === null || loaded === total)) return null;
  return (
    <Flexbox className={styles.footer}>
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
    </Flexbox>
  );
});

CollectionFooter.displayName = 'CollectionFooter';

export default CollectionFooter;
