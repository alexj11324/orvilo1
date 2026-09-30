'use client';

import { Skeleton } from '@lobehub/ui/base-ui';

/** Avoid importing the skeleton barrel from a component it re-exports. */
import ArticleSkeleton from '../Article';
import ConversationSkeletonContainer from './Container';

const ConversationListSkeleton = () => (
  <ConversationSkeletonContainer
    flex={1}
    gap={36}
    height={'100%'}
    padding={12}
    style={{ marginTop: 24 }}
  >
    <div className={'flex flex-col gap-2'} style={{ paddingLeft: '25%', width: '100%' }}>
      <Skeleton.Text rows={3} style={{ alignItems: 'flex-end' }} />
    </div>
    {Array.from({ length: 2 }).map((_, index) => (
      <div className={'flex flex-col gap-2'} key={index} style={{ width: '100%' }}>
        <ArticleSkeleton avatar={28} rows={0} />
        <Skeleton.Text />
        <div className={'flex gap-2'}>
          <Skeleton height={22} radius={4} width={48} />
          <Skeleton height={22} radius={4} width={48} />
        </div>
      </div>
    ))}
  </ConversationSkeletonContainer>
);

export default ConversationListSkeleton;
