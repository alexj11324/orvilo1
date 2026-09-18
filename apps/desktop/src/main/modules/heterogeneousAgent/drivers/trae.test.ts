import { describe, expect, it, vi } from 'vitest';

import { getHeterogeneousAgentDriver } from '../index';
import { sanitizeTraeProviderBindingArgs, traeDriver } from './trae';

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('traeDriver', () => {
  it('is registered for the trae agent type', () => {
    expect(getHeterogeneousAgentDriver('trae')).toBe(traeDriver);
  });

  it('overrides the server-default provider without persisting the operation token', async () => {
    const plan = await traeDriver.prepareServerDefaultBinding!({
      args: ['--profile', 'stale', '--permission-mode', 'auto'],
      endpoint: 'https://app.example.com/',
      env: { ORVILO_TRAE_API_KEY: 'stale-token', TRAE_HOME: '/user/trae' },
      model: 'gpt-5.4',
      profileDir: '/managed/trae',
    });
    expect(plan.args).toEqual([
      '--permission-mode',
      'auto',
      '-c',
      'model="aspectlylabs/gpt-5.4"',
      '-c',
      'model_provider="orvilo"',
      '-c',
      'model_providers.orvilo.name="Orvilo Provider"',
      '-c',
      'model_providers.orvilo.base_url="https://app.example.com/api/v1/openai/v1"',
      '-c',
      'model_providers.orvilo.env_key="ORVILO_TRAE_API_KEY"',
      '-c',
      'model_providers.orvilo.wire_api="responses"',
      '-c',
      'model_providers.orvilo.requires_openai_auth=false',
    ]);
    expect(plan.env).toEqual({ TRAE_HOME: '/user/trae' });
    expect(plan.operationTokenEnvKey).toBe('ORVILO_TRAE_API_KEY');
    expect(plan.args.join(' ')).not.toContain('stale-token');
    expect(plan.profileFiles).toBeUndefined();
  });

  it('removes only host-authoritative provider/model arguments', () => {
    expect(
      sanitizeTraeProviderBindingArgs([
        '-m=old',
        '--profile=personal',
        '--config=model=old',
        '-c',
        'model_providers.other.base_url="https://other"',
        '-c',
        'model_reasoning_effort="high"',
      ]),
    ).toEqual(['-c', 'model_reasoning_effort="high"']);
  });
});
