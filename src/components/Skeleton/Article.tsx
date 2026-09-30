'use client';

import { Skeleton } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import { type CSSProperties, memo } from 'react';

interface ArticleSkeletonProps {
  avatar?: boolean | number;
  className?: string;
  rows?: number;
  style?: CSSProperties;
  title?: boolean | number | string;
}

const ArticleSkeleton = memo<ArticleSkeletonProps>(
  ({ avatar = false, className, rows = 3, style, title = true }) => {
    const body = (
      <div className={'flex flex-col gap-4'} style={{ width: '100%' }}>
        {title !== false && <Skeleton.Text width={title === true ? '60%' : title} />}
        {rows > 0 && <Skeleton.Text rows={rows} />}
      </div>
    );

    if (!avatar)
      return (
        <div className={cn('flex', className)} style={{ ...style, width: '100%' }}>
          {body}
        </div>
      );

    return (
      <div className={cn('flex gap-4', className)} style={{ ...style, width: '100%' }}>
        <Skeleton.Avatar size={avatar === true ? 40 : avatar} />
        {body}
      </div>
    );
  },
);

ArticleSkeleton.displayName = 'ArticleSkeleton';

export default ArticleSkeleton;
