import { Skeleton } from '@/components/ui/skeleton';

export const SkeletonSwitch = () => {
  return <Skeleton className={'h-[calc(var(--spacing)*23/5)] w-8 min-w-8 rounded-full'} />;
};
