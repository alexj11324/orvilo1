import { describe, expect, it } from 'vitest';

import { grokBuildDriver, sanitizeGrokProviderBindingArgs } from './grokBuild';

describe('grokBuildDriver provider binding', () => {
  it('writes a secret-free server-default Responses profile', async () => {
    const plan = await grokBuildDriver.prepareServerDefaultBinding!({
      args: ['--model', 'stale-model', '--effort', 'high'],
      endpoint: 'https://app.example.com/',
      env: { ORVILO_GROK_API_KEY: 'stale-token' },
      model: 'kimi-k2.6',
      profileDir: '/managed/grok',
    });
    const config = plan.profileFiles?.[0]?.content ?? '';
    const alias = plan.args.at(-1);

    expect(plan.args).toEqual(['--effort', 'high', '--model', alias]);
    expect(alias).toMatch(/^orvilo-provider-[\da-f]{16}$/);
    expect(plan.env).toMatchObject({ GROK_HOME: '/managed/grok' });
    expect(plan.env.ORVILO_GROK_API_KEY).toBeUndefined();
    expect(plan.operationTokenEnvKey).toBe('ORVILO_GROK_API_KEY');
    expect(config).toContain('model = "aspectlylabs/kimi-k2.6"');
    expect(config).toContain('base_url = "https://app.example.com/api/v1/openai/v1"');
    expect(config).toContain('api_backend = "responses"');
    expect(config).toContain('auth_scheme = "bearer"');
    expect(config).not.toContain('stale-token');
  });

  it('removes model, profile, agent, and resume overrides while preserving unrelated options', () => {
    expect(
      sanitizeGrokProviderBindingArgs([
        '-m=old',
        '--agent',
        'untrusted',
        '--agent-profile=/untrusted',
        '--resume',
        'old-session',
        '--session-id=other-session',
        '-c',
        '--effort',
        'xhigh',
      ]),
    ).toEqual(['--effort', 'xhigh']);
  });
});
