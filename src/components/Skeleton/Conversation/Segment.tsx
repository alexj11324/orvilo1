'use client';

import { cn } from 'cn';

import SkeletonBar from '../Bar';
import ConversationSkeletonContainer from './Container';
import ConversationListSkeleton from './List';

const styles = {
  composer:
    'h-26.5 overflow-hidden rounded-(--radius-overlay) border border-border bg-card shadow-sm',
};

const ComposerSkeleton = () => (
  <ConversationSkeletonContainer flex={'none'} style={{ paddingBlock: '0 8px' }}>
    <div className={cn('flex', styles.composer)} data-testid={'conversation-composer-skeleton'}>
      <div className={'flex flex-1 flex-col px-3 pbs-3 pbe-2'}>
        <SkeletonBar height={14} width={'38%'} />
      </div>
      <div className={'flex items-center justify-between px-2'}>
        <div className={'flex gap-1.5'}>
          <SkeletonBar height={28} radius={'50%'} width={28} />
          <SkeletonBar height={28} radius={'50%'} width={28} />
        </div>
        <SkeletonBar height={32} radius={16} width={64} />
      </div>
    </div>
    <div className={'flex gap-2 items-center px-1'}>
      <SkeletonBar height={22} radius={11} width={72} />
      <SkeletonBar height={22} radius={11} width={104} />
      <SkeletonBar height={22} radius={11} width={88} />
    </div>
  </ConversationSkeletonContainer>
);

const ConversationSegmentSkeleton = () => (
  <div aria-busy className={'flex min-h-0 flex-1 flex-col overflow-hidden'}>
    <ConversationListSkeleton />
    <ComposerSkeleton />
  </div>
);

export default ConversationSegmentSkeleton;
