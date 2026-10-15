import { cn } from 'cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-(--radius-card) bg-muted', className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
