import { describe, expect, it } from 'vitest';

import { claudeCodeDriver } from './claudeCode';

describe('claudeCodeDriver', () => {
  it('prepares the namespaced server-default model without persisting the operation token', async () => {
    const plan = await claudeCodeDriver.prepareServerDefaultBinding!({
      args: [],
      endpoint: 'https://app.example.com',
      env: { ANTHROPIC_AUTH_TOKEN: 'stale' },
      model: 'claude-sonnet-4-6',
      profileDir: '/tmp/profile',
    });

    expect(plan.args).toEqual(
      expect.arrayContaining(['--model', 'aspectlylabs/claude-sonnet-4-6']),
    );
    expect(plan.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://app.example.com/api/v1/anthropic',
      ANTHROPIC_MODEL: 'aspectlylabs/claude-sonnet-4-6',
      ANTHROPIC_SMALL_FAST_MODEL: 'aspectlylabs/claude-sonnet-4-6',
      CLAUDE_CODE_SUBAGENT_MODEL: 'aspectlylabs/claude-sonnet-4-6',
    });
    expect(plan.operationTokenEnvKey).toBe('ANTHROPIC_AUTH_TOKEN');
    expect(plan.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });
});
