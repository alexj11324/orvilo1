import { useServerConfigStore } from '@/store/serverConfig';
import { featureFlagsSelectors, serverConfigSelectors } from '@/store/serverConfig/selectors';

/**
 * Teammates entry-point gate. The OSS flag schema has no `teammates.enabled`
 * key yet, so the runtime flags record is read defensively: an explicit
 * boolean wins, an absent flag falls back to the workspace flag (teammates is
 * a workspace-scoped feature — where workspaces are off, there's nothing to
 * teammate into). Either way the UI calls the real APIs; nothing is faked.
 */
export const useTeammatesEnabled = (): boolean =>
  useServerConfigStore((s) => {
    const flags = featureFlagsSelectors(s) as Record<string, unknown>;
    const explicit = flags['teammates.enabled'] ?? flags['teammatesEnabled'];
    if (typeof explicit === 'boolean') return explicit;
    return serverConfigSelectors.enableBusinessFeatures(s) && flags['enableWorkspace'] === true;
  });
