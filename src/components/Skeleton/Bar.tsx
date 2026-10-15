'use client';

import { Skeleton } from '@/components/ui/skeleton';

export interface SkeletonBarProps {
  height: number;
  radius?: number | string;
  width?: number | string;
}

const SkeletonBar = ({ height, width = '100%', radius }: SkeletonBarProps) => (
  <Skeleton
    style={{
      borderRadius: radius ?? 'var(--radius-card)',
      height,
      margin: 0,
      maxHeight: height,
      maxWidth: width,
      minHeight: height,
      minWidth: width,
      padding: 0,
      width,
    }}
  />
);

export default SkeletonBar;
