import { toast } from '@lobehub/ui/base-ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useToolStore } from '@/store/tool';

/**
 * Keep the scope-filtered connector lists aligned with the active workspace.
 *
 * `connector.list` and the agent-bound list resolve against the workspace id
 * in the request scope; a fetch that completes while the id is still
 * resolving returns personal-scope rows yet latches the init flags, so the
 * page would stay stale until something else refetches. Keying the effects on
 * the workspace id re-issues both fetches when the real scope lands. A focus
 * refresh also reconciles server-side OAuth callbacks completed in an external
 * browser. The slice's in-scope guard already drops responses that resolve
 * after a scope change, so an extra run is safe.
 */
export const useScopeAwareConnectorFetch = () => {
  const { t } = useTranslation('setting');
  const activeWorkspaceId = useActiveWorkspaceId();
  const fetchConnectors = useToolStore((s) => s.fetchConnectors);
  const fetchAgentBoundConnectors = useToolStore((s) => s.fetchAgentBoundConnectors);

  useEffect(() => {
    fetchConnectors();
  }, [activeWorkspaceId, fetchConnectors]);

  useEffect(() => {
    fetchAgentBoundConnectors();
  }, [activeWorkspaceId, fetchAgentBoundConnectors]);

  useEffect(() => {
    const refetch = () => {
      void Promise.all([fetchConnectors(), fetchAgentBoundConnectors()]).catch(() => {
        toast.error(t('tools.mcpPreset.refreshFailed'));
      });
    };

    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [fetchAgentBoundConnectors, fetchConnectors, t]);
};
