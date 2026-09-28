import { GitPullRequestIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const reviewsRouteMeta = routeMeta({
  icon: GitPullRequestIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.reviews',
});
