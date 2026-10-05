import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} style={{ width: index === 7 ? '60%' : '100%' }} />
        ))}
      </div>
    </div>
  );
};

export default Loading;
