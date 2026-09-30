import { cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';

const VirtuosoLoading = () => {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Loader2Icon className="animate-spin" color={cssVar.colorTextDescription} />
    </div>
  );
};

export default VirtuosoLoading;
