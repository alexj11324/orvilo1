import { describe, expect, it } from 'vitest';

import { kimiCodeDriver } from './kimiCode';

describe('kimiCodeDriver', () => {
  it('prepares the server-default Anthropic binding without persisting its operation token', async () => {
    const plan = await kimiCodeDriver.prepareServerDefaultBinding!({
      args: ['--model', 'stale-model', '--verbose'],
      endpoint: 'https://app.example.com',
      env: { KEEP_ME: 'yes', KIMI_MODEL_API_KEY: 'stale-token' },
      model: 'kimi-k2.6',
      profileDir: '/managed/kimi',
    });

    expect(plan).toMatchObject({
      args: ['--verbose'],
      env: {
        KEEP_ME: 'yes',
        KIMI_CODE_HOME: '/managed/kimi',
        KIMI_MODEL_BASE_URL: 'https://app.example.com/api/v1/anthropic',
        KIMI_MODEL_NAME: 'aspectlylabs/kimi-k2.6',
        KIMI_MODEL_PROVIDER_TYPE: 'anthropic',
      },
      operationTokenEnvKey: 'KIMI_MODEL_API_KEY',
    });
    expect(plan.env.KIMI_MODEL_API_KEY).toBeUndefined();
  });
});
