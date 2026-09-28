import { FilePenLineIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

export const taskDraftsRouteMeta = routeMeta({
  icon: FilePenLineIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'drafts.title',
});
