'use client';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

const styles = {
  listRows: 'flex flex-col border-y border-divider',
};

const GoalSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div aria-busy className={'flex flex-col flex-1'}>
    {chrome !== 'body' && <NavHeader />}
    <WideScreenContainer wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
      <div className={'flex flex-col gap-5 py-4'}>
        <div className={'flex items-center justify-between pbs-1.5 pbe-4.5'}>
          <div className={'flex flex-col gap-1.5'}>
            <SkeletonBar height={20} width={160} />
            <SkeletonBar height={14} width={280} />
          </div>
          <div className={'flex gap-5'}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div className={'flex w-22 flex-col gap-1.25'} key={index}>
                <SkeletonBar height={20} width={32} />
                <SkeletonBar height={12} width={56} />
              </div>
            ))}
          </div>
        </div>
        <div className={'flex flex-col gap-2.5'}>
          <div className={'flex items-center justify-between'}>
            <SkeletonBar height={18} width={112} />
            <div className={'flex gap-2'}>
              <SkeletonBar height={28} width={112} />
              <SkeletonBar height={28} width={64} />
            </div>
          </div>
          <div className={styles.listRows}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div className={'flex items-center gap-3 py-3.5'} key={index}>
                <SkeletonBar height={20} radius={'50%'} width={20} />
                <div className={'flex flex-1 flex-col gap-1.75'}>
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
