import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, it, vi } from 'vitest';

import { openPrimeBuiltinMcp } from './primeBuiltinMcp';

const { exec, awaitChildren, ack, order } = vi.hoisted(() => ({
  ack: vi.fn(async (_args: unknown) => ({ acked: ['delivery'] })),
  awaitChildren: vi.fn(async (_args: unknown) => ({
    contractVersion: 2,
    deliveries: [{ childOperationId: 'child', deliveryState: 'offered', eventId: 'delivery' }],
    results: [{ content: 'member completed', operationId: 'child', status: 'done' }],
    status: 'settled',
  })),
  exec: vi.fn(async (_args: unknown) => ({
    childOperationIds: ['child'],
    deferred: true,
    success: true,
  })),
  order: [] as string[],
}));
vi.mock('../api/client', () => ({
  createLambdaClient: () => ({
    aiAgent: {
      heteroAckChildResultDeliveries: {
        mutate: async (args: unknown) => {
          order.push('ack');
          return ack(args);
        },
      },
      heteroAwaitBuiltinToolChildren: { query: awaitChildren },
      heteroExecBuiltinTool: { mutate: exec },
    },
  }),
}));
vi.mock('../utils/childResultInbox', () => ({
  persistChildResultInboxRecord: async () => {
    order.push('persist');
  },
  resolvePersistentToolCallId: async () => 'call-1',
}));

it('exposes group tools over HTTP and completes deferred children with durable ack', async () => {
  const bridge = await openPrimeBuiltinMcp({
    builtinTools: [
      {
        identifier: 'group',
        apis: [{ name: 'delegate', parameters: { type: 'object', properties: {} } }],
      },
    ],
    jwt: 'operation-token',
    operationId: 'op-current',
    serverUrl: 'http://control',
  });
  expect(bridge).toBeDefined();
  const client = new Client({ name: 'prime-probe', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(bridge!.mount.url)));
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['group__delegate']);
    const result = await client.callTool({ arguments: {}, name: 'group__delegate' });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('member completed');
    expect(exec.mock.calls[0][0]).toMatchObject({
      operationId: 'op-current',
      toolCallId: 'call-1',
    });
    expect(awaitChildren).toHaveBeenCalled();
    expect(order).toEqual(['persist', 'ack']);
  } finally {
    await client.close();
    await bridge!.close();
  }
  await expect(fetch(bridge!.mount.url)).rejects.toThrow();
});
