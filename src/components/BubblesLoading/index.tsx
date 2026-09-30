import { LoadingDots } from '@lobehub/ui/chat';
import { cssVar } from 'antd-style';

const BubblesLoading = () => {
  return (
    <div className={'flex flex-col items-center justify-center'} style={{ height: 24, width: 32 }}>
      <LoadingDots color={cssVar.colorTextSecondary} size={12} variant={'pulse'} />
    </div>
  );
};

export default BubblesLoading;
