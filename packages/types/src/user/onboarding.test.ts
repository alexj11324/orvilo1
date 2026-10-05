import { describe, expect, it } from 'vitest';

import { UserOnboardingSchema } from './onboarding';

describe('first-agent onboarding checkpoint', () => {
  it('preserves the agent identity and workspace when the server parses a retry checkpoint', () => {
    expect(
      UserOnboardingSchema.parse({
        version: 1,
        setup: { firstAgentId: 'agent-created-once', workspaceId: 'workspace-created-once' },
      }).setup,
    ).toEqual({ firstAgentId: 'agent-created-once', workspaceId: 'workspace-created-once' });
  });
});
