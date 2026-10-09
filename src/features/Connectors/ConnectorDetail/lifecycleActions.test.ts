import { describe, expect, it } from 'vitest';

import { getConnectorLifecycleActions, isConnectorConnected } from './lifecycleActions';

describe('getConnectorLifecycleActions', () => {
  it('offers Disconnect and Delete for a connected custom connector', () => {
    expect(
      getConnectorLifecycleActions({ isEnabled: true, sourceType: 'custom', status: 'connected' }),
    ).toEqual({ connect: false, delete: true, disconnect: true, uninstall: false });
  });

  it('offers Connect and no Disconnect for a custom connector that is not authorized yet', () => {
    expect(
      getConnectorLifecycleActions({
        isEnabled: true,
        sourceType: 'custom',
        status: 'disconnected',
      }),
    ).toEqual({ connect: true, delete: true, disconnect: false, uninstall: false });
  });

  it('treats a disconnected (disabled) connector as not connected', () => {
    expect(isConnectorConnected({ isEnabled: false, status: 'connected' })).toBe(false);
    expect(
      getConnectorLifecycleActions({ isEnabled: false, sourceType: 'custom', status: 'connected' })
        .disconnect,
    ).toBe(false);
  });

  it('never offers Delete or Disconnect for tools the user did not author', () => {
    for (const sourceType of ['builtin', 'marketplace'] as const) {
      expect(
        getConnectorLifecycleActions({ isEnabled: true, sourceType, status: 'connected' }),
      ).toEqual({ connect: false, delete: false, disconnect: false, uninstall: true });
    }
  });
});
