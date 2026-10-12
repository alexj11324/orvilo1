import { describe, expect, it } from 'vitest';

import { assertAgentRuntimeSelection } from '../../../packages/database/src/utils/agentRuntimeCreation';
import { buildConnectAgentConfig, getConnectableProvider } from './providers';

describe('saved runtime choices from the Agent creation form', () => {
  it.each(['local', 'device'] as const)(
    'persists a default CLI model on a %s host so creation passes the required-model guard',
    (kind) => {
      const provider = getConnectableProvider('codex')!;
      const config = buildConnectAgentConfig({
        model: 'default',
        provider,
        target: { kind, deviceId: 'owned-host' },
      });
      expect(config.agencyConfig.heterogeneousProvider?.model).toBe('default');
      expect(config.model).toBe('default');
      expect(() => assertAgentRuntimeSelection(config)).not.toThrow();
    },
  );
});
