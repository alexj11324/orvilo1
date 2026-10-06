import { describe, expect, it } from 'vitest';

import { withPrimeBuiltinMcp } from './builtinMcp';

it('mounts the current operation only during its prompt and releases even on failure', async () => {
  let owner: string | undefined;
  let mountedUrl: string | undefined;
  const session = {
    releaseAcpMcpServers: async (id: string) => {
      expect(owner).toBe(id);
      owner = undefined;
      mountedUrl = undefined;
    },
    replaceAcpMcpServers: (servers: readonly { url: string }[], id: string) => {
      owner = id;
      mountedUrl = servers[0].url;
    },
  };
  for (const operationId of ['first', 'resumed']) {
    const url = `http://127.0.0.1:1234/mcp?op=${operationId}`;
    await expect(
      withPrimeBuiltinMcp(session, { operationId, url }, async () => {
        expect(owner).toBe(operationId);
        expect(mountedUrl).toBe(url);
        throw new Error('prompt failed');
      }),
    ).rejects.toThrow('prompt failed');
    expect(owner).toBeUndefined();
  }
});

describe('host endpoint validation', () => {
  it('refuses non-device endpoints before mounting or prompting', async () => {
    const session = {
      releaseAcpMcpServers: async () => {
        throw new Error('unexpected release');
      },
      replaceAcpMcpServers: () => {
        throw new Error('unexpected mount');
      },
    };
    await expect(
      withPrimeBuiltinMcp(session, { operationId: 'op', url: 'https://remote/mcp' }, async () => {
        throw new Error('unexpected prompt');
      }),
    ).rejects.toThrow('loopback');
  });
});
