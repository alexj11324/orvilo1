'use client';

import { Skeleton } from '@/components/ui/skeleton';

/** Avoid importing the skeleton barrel from a component it re-exports. */
import ArticleSkeleton from '../Article';
import ConversationSkeletonContainer from './Container';

const ConversationListSkeleton = () => (
  <ConversationSkeletonContainer
    flex={1}
    height={'100%'}
    style={{ gap: 36, marginTop: 24, padding: 12 }}
  >
    <div className={'flex flex-col gap-2'} style={{ paddingLeft: '25%', width: '100%' }}>
      <div className={'flex flex-col gap-2'} style={{ alignItems: 'flex-end' }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className={'h-4'} key={index} style={{ width: index === 2 ? '60%' : '100%' }} />
        ))}
      </div>
    </div>
    {Array.from({ length: 2 }).map((_, index) => (
      <div className={'flex flex-col gap-2'} key={index} style={{ width: '100%' }}>
        <ArticleSkeleton avatar={28} rows={0} />
        <Skeleton className={'h-4'} />
        <div className={'flex gap-2'}>
          <Skeleton className={'rounded'} style={{ height: 22, width: 48 }} />
          <Skeleton className={'rounded'} style={{ height: 22, width: 48 }} />
        </div>
      </div>
    ))}
  </ConversationSkeletonContainer>
);

export default ConversationListSkeleton;
