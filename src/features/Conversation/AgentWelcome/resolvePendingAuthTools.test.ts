import { describe, expect, it } from 'vitest';

import { ComposioServerStatus } from '@/store/tool/slices/composioStore';

import { resolvePendingAuthTools } from './resolvePendingAuthTools';

const BASE_INPUT = {
  availability: { composio: true, orvilo: true },
  composioInitialized: true,
  composioServers: [],
  orviloInitialized: true,
  orviloServers: [],
  marketAuthenticated: true,
  marketTools: [
    {
      authType: 'market' as const,
      avatar: '💻',
      identifier: 'orvilo-cloud-sandbox',
      label: 'Cloud Sandbox',
    },
  ],
};

describe('resolvePendingAuthTools', () => {
  /**
   * @example Unqualified GitHub, Notion, and X plugins request their Orvilo connector OAuth.
   */
  it('routes overlapping plugins to their canonical Orvilo owner', () => {
    const result = resolvePendingAuthTools({
      ...BASE_INPUT,
      plugins: ['github', 'notion', 'twitter'],
    });

    expect(result.map(({ authType }) => authType)).toEqual(['orvilo', 'orvilo', 'orvilo']);
    expect(result.map((tool) => ('id' in tool ? tool.id : tool.identifier))).toEqual([
      'github',
      'notion',
      'twitter',
    ]);
  });

  /**
   * @example A stale pending Composio GitHub connection cannot override canonical ownership.
   */
  it('routes a stale pending Composio collision to Orvilo', () => {
    // ROOT CAUSE:
    //
    // A persisted Composio server does not record whether the agent plugin came
    // from source-qualified onboarding. Treating every matching row as explicit
    // provenance sends affected GitHub/X users back through the broken provider.
    //
    // Historical collision rows are cleaned up by an out-of-band SQL backfill;
    // runtime ownership therefore remains canonical even if a stale row survives.
    const result = resolvePendingAuthTools({
      ...BASE_INPUT,
      composioServers: [
        {
          appSlug: 'GITHUB',
          authConfigId: 'auth-github',
          connectedAccountId: 'account-github',
          createdAt: 1,
          identifier: 'github',
          label: 'GitHub',
          status: ComposioServerStatus.PENDING_AUTH,
        },
      ],
      plugins: ['github'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.authType).toBe('orvilo');
  });

  /**
   * @example An active legacy Composio collision cannot override canonical ownership after migration.
   */
  it('routes an active legacy Composio collision to Orvilo', () => {
    const result = resolvePendingAuthTools({
      ...BASE_INPUT,
      composioServers: [
        {
          appSlug: 'GITHUB',
          authConfigId: 'auth-github',
          connectedAccountId: 'account-github',
          createdAt: 1,
          identifier: 'github',
          label: 'GitHub',
          status: ComposioServerStatus.ACTIVE,
        },
      ],
      plugins: ['github'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.authType).toBe('orvilo');
  });

  /**
   * @example Connection stores do not emit false unauthorized rows before their first load settles.
   */
  it('waits for the owning connector store to initialize', () => {
    const result = resolvePendingAuthTools({
      ...BASE_INPUT,
      orviloInitialized: false,
      plugins: ['twitter'],
    });

    expect(result).toEqual([]);
  });
});
