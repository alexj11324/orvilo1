'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';

import SkeletonBar from '../Bar';
import ConversationSkeletonContainer from './Container';
import ConversationListSkeleton from './List';

const styles = createStaticStyles(({ css }) => ({
  composer: css`
    overflow: hidden;

    height: 106px;
    border: 1px solid ${cssVar.colorFill};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgElevated};
    box-shadow: 0 4px 4px color-mix(in srgb, #000 4%, transparent);
  `,
}));

const ComposerSkeleton = () => (
  <ConversationSkeletonContainer flex={'none'} style={{ paddingBlock: '0 8px' }}>
    <div className={cn('flex', styles.composer)} data-testid={'conversation-composer-skeleton'}>
      <div className={'flex flex-col flex-1 px-3'} style={{ paddingBlock: '12px 8px' }}>
        <SkeletonBar height={14} width={'38%'} />
      </div>
      <div className={'flex items-center justify-between px-2'}>
        <div className={'flex'} style={{ gap: 6 }}>
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
  <div aria-busy className={'flex flex-col flex-1'} style={{ minHeight: 0, overflow: 'hidden' }}>
    <ConversationListSkeleton />
    <ComposerSkeleton />
  </div>
);

export default ConversationSegmentSkeleton;
