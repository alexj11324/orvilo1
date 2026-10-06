import type { ProviderBinding } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { collectConnectedHarnessTypes } from '@/features/ChatInput/ActionBar/Agent/localHarnessRows';

import {
  collectInstalledHarnessTypes,
  collectRunnableCliHarnessTypes,
  isBuiltinAgentUsable,
  resolveAgentAvailability,
} from './availability';

const binding = (overrides: Partial<ProviderBinding>): ProviderBinding => ({
  createdAt: new Date(0),
  enabled: true,
  endpoint: 'https://api.example.com/v1',
  id: 'bind_1',
  model: 'deepseek-v4-flash',
  name: 'Personal',
  provider: 'deepseek',
  revision: 1,
  secretReference: 'credential:cred_abc',
  selection: {
    effort: 'default',
    mode: 'default',
    runtime: 'orvilo',
    speed: 'default',
    target: 'sandbox',
  },
  updatedAt: new Date(0),
  ...overrides,
});

const NO_BINDINGS: ProviderBinding[] = [];
const NOTHING_CONNECTED = new Set<string>();

describe('isBuiltinAgentUsable', () => {
  it('is false when the user has no provider binding at all', () => {
    // The bug this screen exists for: the builtin row referenced a provider
    // with no credential behind it, so a send could only fail.
    expect(isBuiltinAgentUsable(NO_BINDINGS)).toBe(false);
  });

  it('is true only for an enabled embedded-eligible binding', () => {
    expect(isBuiltinAgentUsable([binding({})])).toBe(true);
  });

  it('ignores bindings the embedded engine cannot issue', () => {
    // Saved-but-not-armed.
    expect(isBuiltinAgentUsable([binding({ enabled: false })])).toBe(false);
    // A CLI-runtime binding is not an embedded route.
    expect(
      isBuiltinAgentUsable([
        binding({
          selection: { ...binding({}).selection, runtime: 'claude-code', target: 'sandbox' },
        }),
      ]),
    ).toBe(false);
    // `resolveOrviloProviderBinding` only ever resolves the sandbox target.
    expect(
      isBuiltinAgentUsable([
        binding({ selection: { ...binding({}).selection, runtime: 'orvilo', target: 'local' } }),
      ]),
    ).toBe(false);
    // A route without a model has nothing to run on.
    expect(isBuiltinAgentUsable([binding({ model: '' })])).toBe(false);
    expect(isBuiltinAgentUsable([binding({ model: '__provider_config__' })])).toBe(false);
    expect(isBuiltinAgentUsable([binding({ secretReference: '' })])).toBe(false);
  });
});

describe('collectRunnableCliHarnessTypes', () => {
  it('keeps connected CLI harnesses', () => {
    expect([...collectRunnableCliHarnessTypes(new Set(['claude-code', 'codex']))]).toEqual([
      'claude-code',
      'codex',
    ]);
  });

  it('never counts the builtin engine as a CLI harness', () => {
    // The builtin's own row stamps `heterogeneousType: 'orvilo'`. Counting it
    // here would report the builtin as a connected CLI agent and hide the very
    // problem the screen is supposed to surface.
    expect([...collectRunnableCliHarnessTypes(new Set(['orvilo']))]).toEqual([]);
  });
});

describe('resolveAgentAvailability', () => {
  it('is unusable on a fresh install', () => {
    expect(
      resolveAgentAvailability({ bindings: NO_BINDINGS, connectedTypes: NOTHING_CONNECTED }),
    ).toEqual({ builtinUsable: false, runnableCliTypes: new Set(), usable: false });
  });

  it('is usable as soon as one CLI harness is connected', () => {
    expect(
      resolveAgentAvailability({
        bindings: NO_BINDINGS,
        connectedTypes: new Set(['claude-code']),
      }).usable,
    ).toBe(true);
  });

  it('does not complete first-agent creation for a binding without an agent', () => {
    expect(
      resolveAgentAvailability({
        bindings: [binding({})],
        connectedTypes: NOTHING_CONNECTED,
      }).usable,
    ).toBe(false);
  });

  it('accepts a persisted Prime agent with an embedded route', () => {
    expect(
      resolveAgentAvailability({
        bindings: [binding({})],
        connectedTypes: collectConnectedHarnessTypes([{ heterogeneousType: 'orvilo' }]),
      }).usable,
    ).toBe(true);
  });

  it('does not treat an unstamped sidebar row as configured Prime when a route exists', () => {
    expect(
      resolveAgentAvailability({
        bindings: [binding({})],
        connectedTypes: collectConnectedHarnessTypes([{}, { heterogeneousType: null }]),
      }).usable,
    ).toBe(false);
  });

  it('rejects a persisted Prime agent without a usable route', () => {
    expect(
      resolveAgentAvailability({ bindings: [], connectedTypes: new Set(['orvilo']) }).usable,
    ).toBe(false);
  });
});

describe('collectInstalledHarnessTypes', () => {
  it('is empty until the scan settles', () => {
    expect(collectInstalledHarnessTypes(null).size).toBe(0);
    expect(collectInstalledHarnessTypes(undefined).size).toBe(0);
  });

  it('counts only what the probe actually answered for', () => {
    const installed = collectInstalledHarnessTypes({
      'claude-code': { available: true, version: '2.1.288' },
      'codex': { available: false, reason: 'spawn codex ENOENT' },
      'opencode': { available: true },
    });

    expect([...installed]).toEqual(['claude-code', 'opencode']);
  });
});
