'use client';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

const MemorySkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div aria-busy className={'flex flex-col flex-1'}>
    {chrome !== 'body' && <NavHeader />}
    <div className={'flex flex-col'} style={{ overflow: 'hidden', height: '100%', width: '100%' }}>
      <WideScreenContainer gap={32} paddingBlock={48}>
        <SkeletonBar height={400} radius={12} />
        <div className={'flex flex-col gap-4'}>
          <SkeletonBar height={32} width={120} />
          <SkeletonBar height={64} radius={8} />
        </div>
        <div className={'flex flex-col gap-4'}>
          <SkeletonBar height={44} width={160} />
          <SkeletonBar height={16} />
          <SkeletonBar height={16} width={'92%'} />
          <SkeletonBar height={16} width={'60%'} />
        </div>
      </WideScreenContainer>
    </div>
  </div>
);

export default MemorySkeleton;
