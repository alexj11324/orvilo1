'use client';

import { cssVar } from 'antd-style';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

const GoalDetailContentSkeleton = () => (
  <div aria-busy className={'flex flex-col gap-5 py-2'}>
    <div className={'flex flex-col'} style={{ gap: 10 }}>
      <SkeletonBar height={28} width={'52%'} />
      <SkeletonBar height={14} width={'78%'} />
    </div>
    <div className={'flex'} style={{ gap: 18 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className={'flex flex-col w-[112px]'} key={index} style={{ gap: 6 }}>
          <SkeletonBar height={22} width={index === 0 ? 68 : 52} />
          <SkeletonBar height={12} width={76} />
        </div>
      ))}
    </div>
    <SkeletonBar height={96} radius={cssVar.borderRadiusLG} />
    <div className={'flex flex-col gap-3'}>
      <SkeletonBar height={18} width={128} />
      <SkeletonBar height={42} radius={cssVar.borderRadiusLG} />
      <SkeletonBar height={42} radius={cssVar.borderRadiusLG} />
      <SkeletonBar height={42} radius={cssVar.borderRadiusLG} />
    </div>
  </div>
);

const GoalDetailSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div className={'flex flex-col flex-1'} style={{ height: '100%' }}>
    {chrome !== 'body' && <NavHeader />}
    <div className={'flex flex-col flex-1'} style={{ overflowY: 'auto' }}>
      <WideScreenContainer>
        <div className={'flex flex-col gap-5 py-4'}>
          <GoalDetailContentSkeleton />
        </div>
      </WideScreenContainer>
    </div>
  </div>
);

export default GoalDetailSkeleton;
