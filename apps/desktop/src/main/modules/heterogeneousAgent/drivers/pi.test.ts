import { describe, expect, it } from 'vitest';

import { getHeterogeneousAgentDriver } from '../index';
import { piDriver, sanitizePiProviderBindingArgs } from './pi';

describe('piDriver', () => {
  it('writes a secret-free server-default Responses profile', async () => {
    const plan = await piDriver.prepareServerDefaultBinding!({
      args: ['--provider', 'stale', '--thinking', 'high'],
      endpoint: 'https://app.example.com',
      env: { ORVILO_PI_API_KEY: 'stale-token' },
      model: 'kimi-k2.6',
      profileDir: '/managed/pi',
    });
    const content = plan.profileFiles?.[0]?.content ?? '';
    const config = JSON.parse(content);
    const provider = config.providers['orvilo-server-default'];

    expect(plan.args).toEqual([
      '--provider',
      'orvilo-server-default',
      '--model',
      'aspectlylabs/kimi-k2.6',
      '--thinking',
      'high',
    ]);
    expect(plan.env).toEqual({ PI_CODING_AGENT_DIR: '/managed/pi' });
    expect(plan.operationTokenEnvKey).toBe('ORVILO_PI_API_KEY');
    expect(provider).toMatchObject({
      api: 'openai-responses',
      apiKey: '$ORVILO_PI_API_KEY',
      baseUrl: 'https://app.example.com/api/v1/openai/v1',
      models: [
        {
          contextWindow: 128_000,
          id: 'aspectlylabs/kimi-k2.6',
          maxTokens: 16_384,
        },
      ],
    });
    expect(content).not.toContain('stale-token');
  });

  it('is registered for the pi agent type', () => {
    expect(getHeterogeneousAgentDriver('pi')).toBe(piDriver);
  });

  it('removes binding and session overrides without removing unrelated args', () => {
    expect(
      sanitizePiProviderBindingArgs([
        '--provider=other',
        '--model',
        'old',
        '--models=one,two',
        '--api-key',
        'secret',
        '--session',
        'other-session',
        '--session-id=other-id',
        '--fork',
        'fork-source',
        '--session-dir=/tmp/sessions',
        '--continue',
        '-c',
        '--resume',
        '-r',
        '--no-session',
        '--thinking=low',
      ]),
    ).toEqual(['--thinking=low']);
  });

  it('keeps managed routing effective before a caller option terminator', async () => {
    const plan = await piDriver.prepareServerDefaultBinding!({
      args: ['--', '--provider', 'message-provider'],
      endpoint: 'https://app.example.com',
      env: {},
      model: 'kimi-k2.6',
      profileDir: '/managed/pi',
    });

    expect(plan.args).toEqual([
      '--provider',
      'orvilo-server-default',
      '--model',
      'aspectlylabs/kimi-k2.6',
      '--',
    ]);
  });
});
