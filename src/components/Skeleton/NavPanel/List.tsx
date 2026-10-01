'use client';

import type { HTMLAttributes } from 'react';

import SkeletonBar from '../Bar';

export const SkeletonItem = ({
  padding = 6,
  height = 36,
  style,
  avatarSize = 28,
  ...rest
}: {
  avatarSize?: number;
  height?: number;
  padding?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) => (
  <div className={'flex flex-1 items-center gap-2'} style={{ height, padding, ...style }} {...rest}>
    <SkeletonBar height={avatarSize} width={avatarSize} />
    <div className={'flex flex-col flex-1'} style={{ height: 16 }}>
      <SkeletonBar height={16} />
    </div>
  </div>
);

export const SkeletonList = ({
  rows = 3,
  ...rest
}: { rows?: number } & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) => (
  <div className={'flex flex-col'} style={{ gap: 2 }} {...rest}>
    {Array.from({ length: rows }).map((_, index) => (
      <SkeletonItem key={index} />
    ))}
  </div>
);

export default SkeletonList;
