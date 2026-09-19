import { InboxIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const inboxRouteMeta = routeMeta({
  icon: InboxIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.inbox',
});

export { inboxRouteMeta as workInboxRouteMeta };
