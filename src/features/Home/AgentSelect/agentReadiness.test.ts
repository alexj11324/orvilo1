import type { DeviceListItem, OrviloAgentAgencyConfig, ProviderBinding } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { agentReadiness } from './agentReadiness';

const config: OrviloAgentAgencyConfig = {
  boundDeviceId: 'device-1',
  executionTarget: 'device',
  heterogeneousProvider: { type: 'codex' },
};
const device = (online: boolean) => ({ deviceId: 'device-1', online }) as DeviceListItem;
const binding = {
  enabled: true,
  model: 'gpt-4.1',
  secretReference: 'credential:cred_test',
  selection: { runtime: 'orvilo', target: 'sandbox' },
} as ProviderBinding;

describe('agentReadiness', () => {
  it('requires a configured profile and real device, excluding discovered installs', () => {
    expect(agentReadiness(undefined, [device(true)], [], false)).toBe('configure');
    expect(agentReadiness({ heterogeneousProvider: { type: 'codex' } }, [], [], true)).toBe(
      'configure',
    );
    expect(agentReadiness(config, [], [], false)).toBe('configure');
    expect(agentReadiness(config, [device(true)], [], false)).toBe('ready');
  });
  it('blocks offline devices and resolves desktop-only local execution explicitly', () => {
    expect(agentReadiness(config, [device(false)], [], false)).toBe('offline');
    const local = { ...config, executionTarget: 'local' as const, boundDeviceId: undefined };
    expect(agentReadiness(local, [], [], false)).toBe('configure');
    expect(agentReadiness(local, [], [], true)).toBe('ready');
  });
  it('requires an enabled credential-backed binding for the configured Prime model', () => {
    const prime = {
      ...config,
      heterogeneousProvider: { type: 'orvilo' as const, model: 'gpt-4.1' },
    };
    expect(agentReadiness(prime, [device(true)], [], false)).toBe('provider');
    expect(agentReadiness(prime, [device(true)], [{ ...binding, enabled: false }], false)).toBe(
      'provider',
    );
    expect(agentReadiness(prime, [device(true)], [{ ...binding, model: 'other' }], false)).toBe(
      'provider',
    );
    expect(agentReadiness(prime, [device(true)], [binding], false)).toBe('ready');
  });
});
