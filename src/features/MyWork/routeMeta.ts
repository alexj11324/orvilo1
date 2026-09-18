import { SquareUserIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const myWorkRouteMeta = routeMeta({
  icon: SquareUserIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.myWork',
});
