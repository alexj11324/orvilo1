'use client';

import { cn } from 'cn';
import { type CSSProperties, memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

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
        {title !== false && (
          <Skeleton className={'h-4'} style={{ width: title === true ? '60%' : title }} />
        )}
        {rows > 0 && (
          <div className={'flex flex-col gap-2'}>
            {Array.from({ length: rows }).map((_, index) => (
              <Skeleton
                className={'h-4'}
                key={index}
                style={{ width: index === rows - 1 ? '60%' : '100%' }}
              />
            ))}
          </div>
        )}
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
        <Skeleton
          className={'rounded-full'}
          style={{ height: avatar === true ? 40 : avatar, width: avatar === true ? 40 : avatar }}
        />
        {body}
      </div>
    );
  },
);

ArticleSkeleton.displayName = 'ArticleSkeleton';

export default ArticleSkeleton;
