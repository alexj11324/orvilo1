import { css, cx } from 'antd-style';

import { Skeleton } from '@/components/ui/skeleton';

const switchLoading = cx(css`
  width: 44px !important;
  min-width: 44px !important;
  height: 22px !important;
  border-radius: 12px !important;
`);

export const SkeletonSwitch = () => {
  return <Skeleton className={switchLoading} style={{ height: 36 }} />;
};
