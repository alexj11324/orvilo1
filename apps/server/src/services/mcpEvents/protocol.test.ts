// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { McpEventsAdapter, selectMcpEventSource } from './adapter';
import { decodeMcpSigningSecret, MCP_EVENTS_PROTOCOL_VERSION } from './protocol';

const discovery = {
  resultType: 'complete',
  supportedVersions: [MCP_EVENTS_PROTOCOL_VERSION],
  capabilities: { events: {} },
};
describe('MCP Events discovery protocol', () => {
  it('offers explicit unavailable or native fallback for old servers', async () => {
    const adapter = new McpEventsAdapter({
      async request() {
        throw { code: -32601 };
      },
    });
    const result = await adapter.discover();
    expect(selectMcpEventSource(result, 'comment.created')).toEqual({
      kind: 'unavailable',
      reason: 'events_unavailable',
    });
    expect(selectMcpEventSource(result, 'comment.created', true)).toEqual({
      kind: 'native',
      reason: 'events_unavailable',
    });
  });
  it('terminates a looping catalog rather than repeatedly requesting a cursor', async () => {
    let calls = 0;
    const adapter = new McpEventsAdapter({
      async request(method) {
        calls++;
        return method === 'server/discover' ? discovery : { events: [], nextCursor: 'loop' };
      },
    });
    await expect(adapter.discover()).rejects.toThrow('repeated a pagination cursor');
    expect(calls).toBe(3);
  });
  it('does not hide authorization failures as unavailable', async () => {
    const adapter = new McpEventsAdapter({
      async request() {
        throw { code: -32012 };
      },
    });
    await expect(adapter.discover()).rejects.toEqual({ code: -32012 });
  });
  it('requires signing secret lengths in the wire profile', () => {
    for (const size of [24, 32, 64])
      expect(
        decodeMcpSigningSecret(`whsec_${Buffer.alloc(size, 1).toString('base64')}`),
      ).toHaveLength(size);
    for (const size of [0, 23, 65])
      expect(() =>
        decodeMcpSigningSecret(`whsec_${Buffer.alloc(size, 1).toString('base64')}`),
      ).toThrow();
  });
});
