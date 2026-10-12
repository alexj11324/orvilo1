'use client';

import { clsx as cx } from 'cn';
import { memo } from 'react';

import { ArticleSkeleton } from '@/components/Skeleton';

const styles = '[@media(width<=575.98px)]:p-4';

const SkeletonLoading = memo<{ className?: string }>(({ className }) => (
  <ArticleSkeleton className={cx(styles, className)} rows={8} />
));

export default SkeletonLoading;
