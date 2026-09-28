import { LayoutListIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const savedViewsRouteMeta = routeMeta({
  icon: LayoutListIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.views',
});
