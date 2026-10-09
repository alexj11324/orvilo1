'use client';

import { Navigate, useParams } from 'react-router';

/**
 * Provider bindings are personal, so the workspace provider page was retired.
 * Workspace-prefixed deep links in the path shape
 * (`/:slug/settings/provider/:providerId`) land on the same provider in the
 * personal settings instead of falling through to the catch-all route.
 */
const WorkspaceProviderRedirect = () => {
  const { providerId = 'all' } = useParams<{ providerId: string }>();

  return <Navigate replace to={`/settings/provider/${encodeURIComponent(providerId)}`} />;
};

WorkspaceProviderRedirect.displayName = 'WorkspaceProviderRedirect';

export default WorkspaceProviderRedirect;
