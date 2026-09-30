import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const WIDTHS = ['70%', '40%', '80%', '30%', '50%', '70%'];

const SkeletonLoading = memo(() => (
  <div className="flex flex-col gap-2 p-3">
    {WIDTHS.map((width, index) => (
      <Skeleton className="h-4" key={index} style={{ width }} />
    ))}
  </div>
));

export default SkeletonLoading;
