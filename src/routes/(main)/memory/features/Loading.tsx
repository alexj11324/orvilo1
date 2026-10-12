import { cn } from 'cn';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { type ViewMode } from './ViewModeSwitcher';

const styles = {
  card: 'flex flex-col gap-3 p-4 border border-divider rounded-(--radius-card) bg-card',
};

const Loading = memo<{ rows?: number; viewMode?: ViewMode }>(({ viewMode, rows = 3 }) => {
  if (viewMode === 'timeline') {
    return (
      <div className="flex flex-col gap-6 py-6 ps-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex flex-col gap-2" key={i}>
            <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-[30%]" />
            <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
            <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
            <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
            <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-[66%]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-3 py-2"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(max(240px, calc((100% - 12px * ${rows - 1}) / ${rows})), 1fr))`,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div className={cn('flex flex-col', styles.card)} key={i}>
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-[80%]" />
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-full" />
          <Skeleton className="rounded-(--radius-card) h-4.5 my-0.5 w-[66%]" />
          <div className="flex gap-2">
            <Skeleton className="rounded-(--radius-card) h-5 w-15" />
            <Skeleton className="rounded-(--radius-card) h-5 w-12.5" />
          </div>
        </div>
      ))}
    </div>
  );
});

export default Loading;
