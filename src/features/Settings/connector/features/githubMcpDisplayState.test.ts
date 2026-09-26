import { describe, expect, it } from 'vitest';

import { isMcpPresetConnected } from './githubMcpDisplayState';

const connector = (grantOwnerUserId: string) =>
  ({
    id: 'github-connector',
    identifier: 'github-mcp',
    isEnabled: true,
    metadata: { githubMcp: { grantOwnerUserId, type: 'github_user_connection' } },
    status: 'connected',
    tools: [],
  }) as any;

describe('isMcpPresetConnected', () => {
  it('keeps a shared workspace connector connected for a non-owner viewer', () => {
    expect(
      isMcpPresetConnected({
        connector: connector('grant-owner'),
        currentUserId: 'workspace-viewer',
        managedAuth: 'github-app',
        providerConnected: false,
      }),
    ).toBe(true);
  });

  it('uses the current viewer grant status when they own the connector grant', () => {
    expect(
      isMcpPresetConnected({
        connector: connector('grant-owner'),
        currentUserId: 'grant-owner',
        managedAuth: 'github-app',
        providerConnected: false,
      }),
    ).toBe(false);
  });

  it('treats a disabled connector as disconnected regardless of grant state', () => {
    expect(
      isMcpPresetConnected({
        connector: { ...connector('grant-owner'), isEnabled: false },
        currentUserId: 'grant-owner',
        managedAuth: 'github-app',
        providerConnected: true,
      }),
    ).toBe(false);
  });
});
