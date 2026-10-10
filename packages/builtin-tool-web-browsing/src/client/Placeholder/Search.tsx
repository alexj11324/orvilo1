import type { BuiltinPlaceholderProps, SearchQuery } from '@orvilo/types';
import { clsx as cx } from 'cn';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { shinyTextStyles } from '@/styles';

const styles = {
  query: cx(
    'rounded-(--radius-card) px-2 py-1 text-xs leading-5 text-muted-foreground hover:bg-accent',
    shinyTextStyles.shinyText,
  ),
};

export const Search = memo<BuiltinPlaceholderProps<SearchQuery>>(({ args }) => {
  const { query } = args || {};

  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cx(
          'flex flex-row justify-between',
          isMobile ? 'items-start gap-2' : 'h-8 items-center gap-10',
        )}
      >
        <div className={cx('flex flex-row items-center gap-2', styles.query)}>
          <span className="anticon" role="img">
            <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
          {query || <Skeleton className="h-5 w-10" />}
        </div>

        <Skeleton className="h-5 w-10" />
      </div>
      <div className="flex flex-row gap-3">
        {['1', '2', '3', '4', '5'].map((id) => (
          <Skeleton className="h-20 w-40" key={id} />
        ))}
      </div>
    </div>
  );
});
