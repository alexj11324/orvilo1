'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

const styles = createStaticStyles(({ css }) => ({
  listRows: css`
    display: flex;
    flex-direction: column;
    border-block: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const GoalSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div aria-busy className={'flex flex-col flex-1'}>
    {chrome !== 'body' && <NavHeader />}
    <WideScreenContainer wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
      <div className={'flex flex-col gap-5 py-4'}>
        <div className={'flex items-center justify-between'} style={{ paddingBlock: '6px 18px' }}>
          <div className={'flex flex-col'} style={{ gap: 6 }}>
            <SkeletonBar height={20} width={160} />
            <SkeletonBar height={14} width={280} />
          </div>
          <div className={'flex gap-5'}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div className={'flex flex-col w-[88px]'} key={index} style={{ gap: 5 }}>
                <SkeletonBar height={20} width={32} />
                <SkeletonBar height={12} width={56} />
              </div>
            ))}
          </div>
        </div>
        <div className={'flex flex-col'} style={{ gap: 10 }}>
          <div className={'flex items-center justify-between'}>
            <SkeletonBar height={18} width={112} />
            <div className={'flex gap-2'}>
              <SkeletonBar height={28} width={112} />
              <SkeletonBar height={28} width={64} />
            </div>
          </div>
          <div className={cn('flex', styles.listRows)}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div className={'flex gap-3 items-center'} key={index} style={{ paddingBlock: 14 }}>
                <SkeletonBar height={20} radius={'50%'} width={20} />
                <div className={'flex flex-col flex-1'} style={{ gap: 7 }}>
                  <SkeletonBar height={16} width={`${36 + index * 8}%`} />
                  <SkeletonBar height={12} width={`${54 + index * 6}%`} />
                </div>
                <SkeletonBar height={24} width={72} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </WideScreenContainer>
  </div>
);

export default GoalSkeleton;
