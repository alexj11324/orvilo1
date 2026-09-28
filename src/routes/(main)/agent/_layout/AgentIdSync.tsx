import { useEffect } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';

import { useResolvedAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useInitAgentConfig } from '@/hooks/useInitAgentConfig';

import { useAgentIdStoreSync } from './useAgentIdStoreSync';

export const getAgentRouteSuffix = (pathname: string, routeAgentId?: string) => {
  if (!routeAgentId) return '';

  const routePrefix = `/agent/${routeAgentId}`;
  const routeStart = pathname.indexOf(routePrefix);
  if (routeStart < 0) return '';

  return pathname.slice(routeStart + routePrefix.length);
};

const AgentIdSync = () => {
  const params = useParams<{ aid?: string; topicId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useWorkspaceAwareNavigate();
  const location = useLocation();
  const { agentId: activeId, isSlugRoute, resolvedAgentId } = useResolvedAgentRouteId(params.aid);

  // Hydrate from the route-owning component. Parent layouts can retain stale
  // params while sibling navigation changes the active agent, which leaves
  // agents absent from the regular sidebar list (for example project
  // coordinators) without a config and renders an empty conversation.
  useInitAgentConfig(activeId);

  // Redirect slug URL to real agent ID URL, preserving child path and query string
  useEffect(() => {
    if (isSlugRoute && resolvedAgentId) {
      // `location.pathname` can be workspace-prefixed (`/:workspaceSlug/agent/:aid`).
      // Replacing only `/agent/:aid` leaves the workspace slug behind and turns it
      // into a fake topic segment after the redirect. Slice from the actual Agent
      // route boundary so both personal and workspace mirrors preserve only the
      // real child path.
      const suffix = getAgentRouteSuffix(location.pathname, params.aid);
      const qs = searchParams.toString();
      navigate(`/agent/${resolvedAgentId}${suffix}${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [isSlugRoute, resolvedAgentId, navigate, searchParams, location.pathname, params.aid]);

  useAgentIdStoreSync({
    activeId,
    topicFromPath: params.topicId,
    topicFromQuery: searchParams.get('topic'),
  });

  return null;
};

export default AgentIdSync;
