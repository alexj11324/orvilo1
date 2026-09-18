import { InboxIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

/**
 * The inbox's own route. Its shape is a stack of titled sections, so the generic
 * list skeleton is the close-enough stand-in.
 */
export const inboxRouteMeta = routeMeta({
  icon: InboxIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.inbox',
});
