import { cn } from 'cn';
import { memo } from 'react';

import ArticleSkeleton from '@/components/Skeleton/Article';

const styles = {
  card: 'aspect-[0.9] rounded-(--radius-card) border border-divider bg-card p-3',
  grid: 'grid w-full grid-cols-[repeat(3,minmax(280px,1fr))] gap-4 [@media(width>=1600px)]:grid-cols-[repeat(4,minmax(280px,1fr))] [@media(width<=920px)]:grid-cols-[repeat(2,minmax(280px,1fr))] [@media(width<=620px)]:grid-cols-[minmax(0,1fr)]',
  scroll: 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pbs-2 pbe-6',
};

export const WorkGalleryCardsSkeleton = memo<{ count?: number }>(({ count = 8 }) => (
  <div className={styles.grid}>
    {Array.from({ length: count }).map((_, index) => (
      <div className={styles.card} key={index}>
        <ArticleSkeleton rows={6} />
      </div>
    ))}
  </div>
));

WorkGalleryCardsSkeleton.displayName = 'WorkGalleryCardsSkeleton';

const WorkGallerySkeleton = () => (
  <div aria-busy className="flex h-full flex-col">
    <div className={cn('flex flex-col', styles.scroll)}>
      <WorkGalleryCardsSkeleton />
    </div>
  </div>
);

export default WorkGallerySkeleton;
