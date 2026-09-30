import { Skeleton } from '@lobehub/ui/base-ui';

const Loading = () => {
  return (
    <div className="flex flex-col">
      <Skeleton.Text rows={8} />
    </div>
  );
};

export default Loading;
