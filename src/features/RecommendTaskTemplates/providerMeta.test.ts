import type { TaskTemplateConnectorReference } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import { findNextUnconnectedSpec, getProviderMeta } from './providerMeta';

describe('getProviderMeta', () => {
  it('resolves orvilo source via ORVILO_SKILL_PROVIDERS', () => {
    const meta = getProviderMeta({ identifier: 'github', source: 'orvilo' });
    expect(meta).toMatchObject({ identifier: 'github', label: 'GitHub', source: 'orvilo' });
    expect(meta?.icon).toBeDefined();
  });

  it('resolves notion as a orvilo source provider', () => {
    const meta = getProviderMeta({ identifier: 'notion', source: 'orvilo' });
    expect(meta).toMatchObject({ identifier: 'notion', label: 'Notion', source: 'orvilo' });
    expect(meta?.icon).toBeDefined();
  });

  it('resolves posthog as a orvilo source provider', () => {
    const meta = getProviderMeta({ identifier: 'posthog', source: 'orvilo' });
    expect(meta).toMatchObject({ identifier: 'posthog', label: 'PostHog', source: 'orvilo' });
    expect(meta?.icon).toBeDefined();
  });

  it('resolves composio source via COMPOSIO_APP_TYPES', () => {
    const meta = getProviderMeta({ identifier: 'gmail', source: 'composio' });
    expect(meta).toMatchObject({ identifier: 'gmail', label: 'Gmail', source: 'composio' });
    expect(meta?.icon).toBeDefined();
  });

  it('returns undefined for unknown provider', () => {
    expect(getProviderMeta({ identifier: 'nonexistent-x', source: 'orvilo' })).toBeUndefined();
    expect(getProviderMeta({ identifier: 'nonexistent-x', source: 'composio' })).toBeUndefined();
  });

  it('does not cross namespaces (orvilo id under composio source returns undefined)', () => {
    // 'posthog' is a orvilo provider id, not a composio identifier.
    expect(getProviderMeta({ identifier: 'posthog', source: 'composio' })).toBeUndefined();
  });
});

describe('findNextUnconnectedSpec', () => {
  const allConnected = () => true;
  const noneConnected = () => false;

  it('returns undefined when specs is undefined or empty', () => {
    expect(findNextUnconnectedSpec(undefined, noneConnected)).toBeUndefined();
    expect(findNextUnconnectedSpec([], noneConnected)).toBeUndefined();
  });

  it('returns undefined when all specs are connected', () => {
    const specs: TaskTemplateConnectorReference[] = [
      { identifier: 'github', source: 'orvilo' },
      { identifier: 'notion', source: 'orvilo' },
    ];
    expect(findNextUnconnectedSpec(specs, allConnected)).toBeUndefined();
  });

  it('returns the first spec when none are connected', () => {
    const specs: TaskTemplateConnectorReference[] = [
      { identifier: 'github', source: 'orvilo' },
      { identifier: 'notion', source: 'orvilo' },
    ];
    const result = findNextUnconnectedSpec(specs, noneConnected);
    expect(result?.identifier).toBe('github');
    expect(result?.label).toBe('GitHub');
  });

  it('skips already-connected specs and returns the next missing one in order', () => {
    const specs: TaskTemplateConnectorReference[] = [
      { identifier: 'github', source: 'orvilo' },
      { identifier: 'linear', source: 'orvilo' },
      { identifier: 'notion', source: 'orvilo' },
    ];
    const isConnected = (s: TaskTemplateConnectorReference) =>
      s.identifier === 'github' || s.identifier === 'linear';
    const result = findNextUnconnectedSpec(specs, isConnected);
    expect(result?.identifier).toBe('notion');
    expect(result?.source).toBe('orvilo');
  });

  it('skips specs with unknown providers (no meta) and continues searching', () => {
    const specs: TaskTemplateConnectorReference[] = [
      { identifier: 'nonexistent-x', source: 'orvilo' },
      { identifier: 'notion', source: 'orvilo' },
    ];
    const result = findNextUnconnectedSpec(specs, noneConnected);
    expect(result?.identifier).toBe('notion');
  });
});
