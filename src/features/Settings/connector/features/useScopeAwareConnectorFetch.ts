import { useEffect } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useToolStore } from '@/store/tool';

/**
 * Keep the scope-filtered connector lists aligned with the active workspace.
 *
 * `connector.list` and the agent-bound list resolve against the workspace id
 * in the request scope; a fetch that completes while the id is still
 * resolving returns personal-scope rows yet latches the init flags, so the
 * page would stay stale until something else refetches. Keying the effects on
 * the workspace id re-issues both fetches when the real scope lands — the
 * slice's in-scope guard already drops responses that resolve after a scope
 * change, so an extra run is safe.
 */
export const useScopeAwareConnectorFetch = () => {
  const activeWorkspaceId = useActiveWorkspaceId();
  const fetchConnectors = useToolStore((s) => s.fetchConnectors);
  const fetchAgentBoundConnectors = useToolStore((s) => s.fetchAgentBoundConnectors);

  useEffect(() => {
    fetchConnectors();
  }, [activeWorkspaceId, fetchConnectors]);

  useEffect(() => {
    fetchAgentBoundConnectors();
  }, [activeWorkspaceId, fetchAgentBoundConnectors]);
};
