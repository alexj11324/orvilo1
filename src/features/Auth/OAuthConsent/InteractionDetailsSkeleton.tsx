'use client';

import { Skeleton } from '@lobehub/ui/base-ui';
import { memo } from 'react';

import AuthCard from '@/features/AuthCard';

const InteractionDetailsSkeleton = memo(() => (
  <div className="flex flex-col gap-4" style={{ width: 'min(100%,400px)' }}>
    <div className="flex items-center justify-center w-full">
      <Skeleton.Avatar shape={'square'} size={72} />
    </div>
    <AuthCard
      title={<Skeleton height={40} />}
      footer={
        <div className="flex flex-col gap-3 w-full">
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      }
      subtitle={
        <div className="flex flex-col gap-2 w-full">
          <Skeleton height={22} />
          <Skeleton height={22} width={'72%'} />
        </div>
      }
    >
      <div className="flex flex-col gap-3 w-full">
        <Skeleton height={22} width={'54%'} />
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col p-4">
            <Skeleton height={36} />
          </div>
          <div className="flex flex-col p-4">
            <Skeleton width={'68%'} />
          </div>
        </div>
      </div>
    </AuthCard>
  </div>
));

InteractionDetailsSkeleton.displayName = 'OAuthInteractionDetailsSkeleton';

export default InteractionDetailsSkeleton;
