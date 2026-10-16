import { describe, expect, it, vi } from 'vitest';

import { CredsExecutionRuntime } from './ExecutionRuntime';
import { CredsManifest } from './manifest';

const createRuntime = () => {
  const service = {
    injectCreds: vi.fn().mockResolvedValue({ credentials: {}, notFound: [], success: true }),
    listCreds: vi.fn(),
    saveKVCred: vi.fn().mockResolvedValue({ id: 'credential-1' }),
  };
  const runtime = new CredsExecutionRuntime(service, { topicId: 'topic-1', userId: 'user-1' });
  return { runtime, service };
};

describe('credential tool Marketplace retirement', () => {
  it('advertises only local credential storage and sandbox injection', () => {
    expect(CredsManifest.api.map((api) => api.name)).toEqual(['injectCredsToSandbox', 'saveCreds']);
  });

  it('has no OAuth acquisition runtime methods', () => {
    const { runtime } = createRuntime();
    expect(runtime).not.toHaveProperty('connectComposioService');
    expect(runtime).not.toHaveProperty('initiateOAuthConnect');
  });

  it('preserves authorized sandbox injection through the existing service', async () => {
    const { runtime, service } = createRuntime();
    expect(await runtime.injectCredsToSandbox({ keys: ['api-key'] })).toMatchObject({
      success: true,
    });
    expect(service.injectCreds).toHaveBeenCalledExactlyOnceWith({
      keys: ['api-key'],
      sandbox: true,
      topicId: 'topic-1',
      userId: 'user-1',
    });
  });

  it('preserves local KV credential saving', async () => {
    const { runtime, service } = createRuntime();
    const input = {
      key: 'api-key',
      name: 'API Key',
      type: 'kv-env' as const,
      values: { TOKEN: 'test' },
    };
    expect(await runtime.saveCreds(input)).toMatchObject({ success: true });
    expect(service.saveKVCred).toHaveBeenCalledWith(input);
  });
});
