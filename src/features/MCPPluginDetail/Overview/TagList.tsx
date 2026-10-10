'use client';

import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

const styles = {
  tag: 'm-0 py-1 px-3 rounded-[16px] text-muted-foreground',
};

const TagList = memo<{ tags: string[] }>(({ tags }) => {
  const showTags = Boolean(tags?.length && tags?.length > 0);
  return (
    showTags && (
      <div className="flex gap-2 flex-wrap">
        {tags.map((tag) => (
          <Badge className={styles.tag} key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
    )
  );
});

export default TagList;
