import { clsx as cx } from 'cn';
import { memo, useMemo } from 'react';

import { Badge } from '@/components/reui/badge';
import { type SemanticSearchChunk } from '@/types/chunk';

const styles = {
  container:
    'pbs-3 pbe-3 px-2 border-be border-solid border-divider rounded-(--radius-card) hover:bg-accent',
  pageNumber: 'text-xs leading-5 text-foreground-description',
  text: 'text-sm leading-5.5 text-foreground',
  title: 'text-xl leading-7 font-semibold text-foreground',
};

interface ChunkItemProps extends Omit<SemanticSearchChunk, 'index'> {
  index: number;
}

const SearchItem = memo<ChunkItemProps>(({ text, pageNumber, type, similarity }) => {
  const typeClassName = useMemo(() => {
    switch (type) {
      default: {
        return styles.text;
      }
      case 'Title': {
        return styles.title;
      }
    }
  }, [type]);

  return (
    <div className={cx('flex flex-col gap-2', cx(styles.container, typeClassName))}>
      {text}

      <div className="flex flex-row items-center justify-between">
        <Badge variant="secondary">{similarity.toFixed(2)}</Badge>
        <div className={cx('flex flex-col', styles.pageNumber)}>第 {pageNumber} 页</div>
      </div>
    </div>
  );
});

export default SearchItem;
