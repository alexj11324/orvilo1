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

  it('materializes a host-owned Anthropic binding and scrubs conflicting user config', async () => {
    const plan = await claudeCodeDriver.prepareProviderBinding!({
      args: ['--model', 'stale-model', '--effort', 'high'],
      env: { ANTHROPIC_API_KEY: 'stale-key', KEEP_ME: 'yes' },
      profileDir: '/managed/claude',
      reference: {
        apiConfig: { model: 'claude-primary', providerId: 'anthropic-custom' },
        kind: 'provider',
      },
      resolution: {
        agentType: 'claude-code',
        apiConfig: { model: 'claude-primary', providerId: 'anthropic-custom' },
        endpoint: 'https://gateway.example.com',
        protocol: 'anthropic-messages',
        providerId: 'anthropic-custom',
        runtimeConfig: {
          config: {},
          keyVaults: { apiKey: 'bound-key', baseURL: 'https://gateway.example.com/v1' },
          settings: { sdkType: 'anthropic' },
        },
      },
      runDir: '/managed/run',
    });

    expect(plan).toMatchObject({
      args: ['--effort', 'high', '--model', 'claude-primary'],
      env: {
        ANTHROPIC_AUTH_TOKEN: 'bound-key',
        ANTHROPIC_BASE_URL: 'https://gateway.example.com',
        CLAUDE_CONFIG_DIR: '/managed/claude',
        KEEP_ME: 'yes',
      },
    });
    expect(plan.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
