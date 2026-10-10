import { clsx as cx } from 'cn';
import { memo, useMemo } from 'react';

import { useFileStore } from '@/store/file';
import { type FileChunk } from '@/types/chunk';

const styles = {
  container:
    'py-3 px-2 [border-block-end:1px_dashed_var(--divider)] rounded-(--radius-card) hover:bg-accent',
  text: 'text-sm leading-5.5 text-foreground',
  title: 'text-xl leading-7 font-semibold text-foreground',
};

type ChunkItemProps = FileChunk;

const ChunkItem = memo<ChunkItemProps>(({ text, type, id }) => {
  const highlightChunks = useFileStore((s) => s.highlightChunks);

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
    <div
      className={cx('flex flex-col', cx(styles.container, typeClassName))}
      onMouseEnter={() => {
        highlightChunks([id]);
      }}
      onMouseLeave={() => {
        highlightChunks([]);
      }}
    >
      {text}
    </div>
  );
});

export default ChunkItem;
