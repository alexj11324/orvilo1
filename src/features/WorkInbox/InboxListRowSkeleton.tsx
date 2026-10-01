import { Skeleton } from '@/components/ui/skeleton';

interface InboxListRowSkeletonProps {
  rows?: number;
}

// Mirrors InboxListRow's shape — 40px avatar disc + two text lines — so the
// loading state reads like the Plane-style cards it stands in for.
const InboxListRowSkeleton = ({ rows = 8 }: InboxListRowSkeletonProps) => (
  <div aria-busy className="flex flex-col gap-2 p-3" role="status">
    {Array.from({ length: rows }, (_, index) => (
      <div className="flex items-start gap-3 px-2 py-2" key={index}>
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5 py-0.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export default InboxListRowSkeleton;
