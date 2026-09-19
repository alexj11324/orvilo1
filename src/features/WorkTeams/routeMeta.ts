import { UsersIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const teamsRouteMeta = routeMeta({
  icon: UsersIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.teams',
});
