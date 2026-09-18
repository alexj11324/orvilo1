'use client';

import AsyncError from '@/components/AsyncError';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useProjectStore } from '@/store/project';

import ProjectResources from './ProjectResources';

/**
 * A project's resources are the knowledge bases it references. The page reads
 * the project detail the workspace already fetches — `knowledgeBases` is part
 * of that payload — so there is no second request and no second cache to keep
 * in step, and `mutate` after an add or a removal refreshes sidebar, dashboard
 * and this list together.
 */
const ProjectResourcesPage = () => {
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { data, error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(
    projectId,
  );

  if (isLoading && !data) return <RouteLoading />;
  if (error && !data)
    return <AsyncError error={error} variant={'page'} onRetry={() => void mutate()} />;
  if (!data) return null;

  return (
    <ProjectResources
      detail={data.data}
      projectId={data.data.project.id}
      onRefresh={() => void mutate()}
    />
  );
};

export default ProjectResourcesPage;
