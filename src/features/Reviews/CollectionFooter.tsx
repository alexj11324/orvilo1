import { clsx } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';

const styles = {
  footer:
    'flex items-center justify-between gap-2 border-t border-dashed border-divider px-3 py-1.5',
} as const;

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
    <div className={clsx('flex flex-col', styles.footer)}>
      {error ? (
        <AsyncError error={error} variant={'inline'} onRetry={onRetry} />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {stale
              ? t('reviews.staleBanner')
              : t('reviews.loadedCount', { loaded, total: total ?? '…' })}
          </div>
          {hasMore && !stale ? (
            <Button loading={loading} size="lg" variant="ghost" onClick={onLoadMore}>
              {t('myWork.loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
});

CollectionFooter.displayName = 'CollectionFooter';

export default CollectionFooter;
