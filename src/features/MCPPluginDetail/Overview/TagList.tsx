'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    tag: css`
      margin: 0;
      padding-block: 4px;
      padding-inline: 12px;
      border-radius: 16px;

      color: ${cssVar.colorTextSecondary};
    `,
  };
});

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
