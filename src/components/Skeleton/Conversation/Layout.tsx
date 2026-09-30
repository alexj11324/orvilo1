'use client';

import SkeletonBar from '../Bar';
import ConversationSegmentSkeleton from './Segment';

const ConversationLayoutSkeleton = () => (
  <div aria-busy className={'flex flex-col flex-1'} style={{ minHeight: 0, overflow: 'hidden' }}>
    <div className={'flex items-center justify-between px-3'} style={{ flex: 'none', height: 44 }}>
      <SkeletonBar height={24} width={144} />
      <SkeletonBar height={28} width={72} />
    </div>
    <ConversationSegmentSkeleton />
  </div>
);

export default ConversationLayoutSkeleton;
