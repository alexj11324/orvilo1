import { UsersIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const membersRouteMeta = routeMeta({
  icon: UsersIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navPanel.members',
});
