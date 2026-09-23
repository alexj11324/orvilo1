'use client';

import AsyncError from '@/components/AsyncError';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useProjectStore } from '@/store/project';

import ProjectMilestonesPage from './ProjectMilestonesPage';

/**
 * Milestones ride on the project detail payload — the same response the
 * overview and the side panel read — so this page adds no second fetch, and a
 * milestone write's detail refetch keeps every surface in step.
 */
const ProjectMilestonesRoute = () => {
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { data, error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(
    projectId,
  );

  if (isLoading && !data) return <RouteLoading />;
  if (error && !data)
    return <AsyncError error={error} variant={'page'} onRetry={() => void mutate()} />;
  if (!data) return null;

  return <ProjectMilestonesPage detail={data.data} />;
};

export default ProjectMilestonesRoute;
