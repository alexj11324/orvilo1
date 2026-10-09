'use client';

import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';

import { isWorkspaceSettingsTabAvailable } from '@/config/routes/settings';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

interface WorkspaceSettingsTabGateProps {
  children: ReactNode;
  tab: string;
}

/**
 * Wraps a workspace settings leaf whose page only exists where the business
 * overlay ships. Where the flag is off the URL behaves like an unknown tab and
 * returns to the workspace settings root, instead of mounting a blank pane.
 */
const WorkspaceSettingsTabGate = ({ children, tab }: WorkspaceSettingsTabGateProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const serverConfigInit = useServerConfigStore((s) => s.serverConfigInit);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);

  if (isWorkspaceSettingsTabAvailable(tab, { enableBusinessFeatures })) return children;
  // The flag is unknown until the server config lands; redirecting earlier
  // would bounce a cloud deployment's deep link.
  if (!serverConfigInit) return null;

  return <Navigate replace to={workspaceSlug ? `/${workspaceSlug}/settings` : '/settings'} />;
};

WorkspaceSettingsTabGate.displayName = 'WorkspaceSettingsTabGate';

export default WorkspaceSettingsTabGate;
