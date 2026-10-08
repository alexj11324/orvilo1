import { Spinner } from '@/components/ui/spinner';

const VirtuosoLoading = () => {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Spinner className="text-muted-foreground" />
    </div>
  );
};

export default VirtuosoLoading;
