'use client';

import { cn } from 'cn';
import { memo } from 'react';

import { ArticleSkeleton } from '@/components/Skeleton';

const styles = '[@media(width<=575.98px)]:p-4';

const SkeletonLoading = memo<{ className?: string }>(({ className }) => (
  <ArticleSkeleton className={cn(styles, className)} rows={8} />
));

export default SkeletonLoading;
