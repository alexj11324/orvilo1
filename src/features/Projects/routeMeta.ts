import { DiamondIcon, HistoryIcon, LibraryBigIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { routeMeta } from '@/spa/router/routeMeta';

import { PROJECT_ENTITY_ICON } from './ProjectIcon';

export const projectsRouteMeta = routeMeta({
  icon: PROJECT_ENTITY_ICON,
  Skeleton: createSurfaceSkeleton('grid'),
  titleKey: 'navigation.projects',
});

export const projectActivityRouteMeta = routeMeta({
  icon: HistoryIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.projectActivity',
});

export const projectMilestonesRouteMeta = routeMeta({
  icon: DiamondIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.projectMilestones',
});

export const projectResourcesRouteMeta = routeMeta({
  icon: LibraryBigIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.projectResources',
});

/**
 * A knowledge base's own page, mounted inside the project so following a
 * project resource keeps the project's sidebar instead of dropping the reader
 * into the workspace-wide library shell.
 */
export const projectLibraryRouteMeta = routeMeta({
  icon: LibraryBigIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.knowledgeBase',
});
