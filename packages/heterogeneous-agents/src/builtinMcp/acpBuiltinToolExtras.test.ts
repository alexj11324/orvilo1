import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildAcpBuiltinToolExtras, decodeAcpBuiltinToolSpecs } from './acpBuiltinToolExtras';
import { jsonSchemaToZodRawShape } from './jsonSchemaToZod';

describe('jsonSchemaToZodRawShape', () => {
  it('converts properties + required into a ZodRawShape', () => {
    const shape = jsonSchemaToZodRawShape({
      properties: {
        count: { description: 'how many', type: 'integer' },
        name: { type: 'string' },
      },
      required: ['name'],
      type: 'object',
    });

    expect(Object.keys(shape).sort()).toEqual(['count', 'name']);
    expect(z.safeParse(shape.name, 'x').success).toBe(true);
    expect(z.safeParse(shape.name, 1).success).toBe(false);
    expect(z.safeParse(shape.name, undefined).success).toBe(false);
    expect(z.safeParse(shape.count, undefined).success).toBe(true);
    expect(z.safeParse(shape.count, 3).success).toBe(true);
  });

  it('handles nested objects, arrays and enums', () => {
    const shape = jsonSchemaToZodRawShape({
      properties: {
        mode: { enum: ['a', 'b'] },
        tags: { items: { type: 'string' }, minItems: 1, type: 'array' },
        nested: {
          properties: { flag: { type: 'boolean' } },
          required: ['flag'],
          type: 'object',
        },
      },
      required: ['mode'],
      type: 'object',
    });

    expect(z.safeParse(shape.mode, 'a').success).toBe(true);
    expect(z.safeParse(shape.mode, 'z').success).toBe(false);
    expect(z.safeParse(shape.tags, []).success).toBe(false);
    expect(z.safeParse(shape.tags, ['x']).success).toBe(true);
    expect(z.safeParse(shape.nested, { flag: true }).success).toBe(true);
    expect(z.safeParse(shape.nested, {}).success).toBe(false);
  });

  it('degrades unknown shapes to z.any()', () => {
    const shape = jsonSchemaToZodRawShape({
      properties: { whatever: { type: 'funky-type' } },
      type: 'object',
    });
    expect(z.safeParse(shape.whatever, { arbitrary: 1 }).success).toBe(true);
  });

  it('returns an empty shape for non-object input', () => {
    expect(jsonSchemaToZodRawShape(undefined)).toEqual({});
    expect(jsonSchemaToZodRawShape({ type: 'string' })).toEqual({});
  });
});

describe('decodeAcpBuiltinToolSpecs', () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

  it('decodes a valid base64 spec list', () => {
    const specs = [{ apis: [{ name: 'call' }], identifier: 'orvilo-agent' }];
    expect(decodeAcpBuiltinToolSpecs(encode(specs))).toEqual(specs);
  });

  it('returns [] for missing or malformed input', () => {
    expect(decodeAcpBuiltinToolSpecs(undefined)).toEqual([]);
    expect(decodeAcpBuiltinToolSpecs('not-base64!!!')).toEqual([]);
    expect(decodeAcpBuiltinToolSpecs(encode({ nope: true }))).toEqual([]);
    expect(decodeAcpBuiltinToolSpecs(encode([{ apis: 'x' }]))).toEqual([]);
  });
});

describe('buildAcpBuiltinToolExtras', () => {
  const specs = [
    {
      apis: [
        {
          description: 'spawn a sub agent',
          name: 'callSubAgent',
          parameters: {
            properties: { instruction: { type: 'string' } },
            required: ['instruction'],
            type: 'object',
          },
        },
      ],
      identifier: 'orvilo-agent',
    },
  ];

  it('mounts one MCP tool per api with identifier__apiName naming', () => {
    const extras = buildAcpBuiltinToolExtras(specs, {
      awaitChildren: vi.fn(),
      exec: vi.fn().mockResolvedValue({ content: 'ok', success: true }),
    });
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('orvilo-agent__callSubAgent');
    expect(extras[0].description).toBe('spawn a sub agent');
    expect(z.safeParse(extras[0].inputSchema.instruction, 'go').success).toBe(true);
  });

  it('returns the exec result content as the tool result', async () => {
    const exec = vi.fn().mockResolvedValue({ content: 'did the thing', success: true });
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren: vi.fn(), exec });
    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(exec).toHaveBeenCalledWith(
      expect.objectContaining({
        apiName: 'callSubAgent',
        args: { instruction: 'go' },
        identifier: 'orvilo-agent',
        operationId: 'op_1',
      }),
    );
    expect(result.content[0]).toEqual({ text: 'did the thing', type: 'text' });
    expect(result.isError).toBeUndefined();
  });

  it('surfaces exec failures as isError tool results', async () => {
    const exec = vi.fn().mockResolvedValue({ error: { message: 'nope' }, success: false });
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren: vi.fn(), exec });
    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ text: 'nope', type: 'text' });
  });

  it('polls deferred children until settled and returns their content', async () => {
    const exec = vi.fn().mockResolvedValue({
      childOperationIds: ['child_1'],
      deferred: true,
      success: true,
    });
    const awaitChildren = vi
      .fn()
      .mockResolvedValueOnce({ pendingOperationIds: ['child_1'], status: 'pending' })
      .mockResolvedValueOnce({
        results: [{ content: 'child output', operationId: 'child_1', status: 'done' }],
        status: 'settled',
      });
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren, exec });
    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(awaitChildren).toHaveBeenCalledTimes(2);
    expect(result.content[0]).toEqual({ text: 'child output', type: 'text' });
    expect(result.isError).toBeUndefined();
  });

  it('marks deferred results as errors when a child fails', async () => {
    const exec = vi.fn().mockResolvedValue({
      childOperationIds: ['child_1'],
      deferred: true,
      success: true,
    });
    const awaitChildren = vi.fn().mockResolvedValue({
      results: [{ error: 'boom', operationId: 'child_1', status: 'error' }],
      status: 'settled',
    });
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren, exec });
    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(result.isError).toBe(true);
  });

  it('SA04-A: derives a stable toolCallId — the host toolUseId wins, else a deterministic digest', async () => {
    const exec = vi.fn().mockResolvedValue({ content: 'ok', success: true });
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren: vi.fn(), exec });

    // The host's own invocation id is reused verbatim.
    await extras[0].handler(
      'op_1',
      { instruction: 'go' },
      {
        _meta: { 'claudecode/toolUseId': 'toolu_host_1' },
      },
    );
    expect(exec).toHaveBeenLastCalledWith(expect.objectContaining({ toolCallId: 'toolu_host_1' }));

    // Without host metadata the id is derived from the logical call — a
    // crashed/retried handler re-derives the SAME id (no fresh mint).
    await extras[0].handler('op_1', { instruction: 'go' });
    const derived = exec.mock.calls.at(-1)?.[0].toolCallId;
    expect(derived).toMatch(/^mcp_[0-9a-f]{48}$/);
    await extras[0].handler('op_1', { instruction: 'go' });
    expect(exec.mock.calls.at(-1)?.[0].toolCallId).toBe(derived);
    // A different op derives a different id.
    await extras[0].handler('op_2', { instruction: 'go' });
    expect(exec.mock.calls.at(-1)?.[0].toolCallId).not.toBe(derived);
  });

  const settledV2 = {
    contractVersion: 2 as const,
    deliveries: [
      { childOperationId: 'child_1', deliveryState: 'offered' as const, eventId: 'e_1' },
    ],
    results: [{ content: 'child output', operationId: 'child_1', status: 'done' }],
    status: 'settled' as const,
  };

  it('SA04-A: v2 settle persists the inbox BEFORE the ack — order enforced', async () => {
    const order: string[] = [];
    const exec = vi
      .fn()
      .mockResolvedValue({ childOperationIds: ['child_1'], deferred: true, success: true });
    const awaitChildren = vi.fn().mockResolvedValue(settledV2);
    const ackChildResults = vi.fn().mockImplementation(async () => {
      order.push('ack');
      return { acked: ['e_1'], ignored: [] };
    });
    const persistChildResultInbox = vi.fn().mockImplementation(async () => {
      order.push('inbox');
    });
    const extras = buildAcpBuiltinToolExtras(specs, {
      ackChildResults,
      awaitChildren,
      exec,
      persistChildResultInbox,
    });

    const result = await extras[0].handler(
      'op_1',
      { instruction: 'go' },
      {
        _meta: { 'claudecode/toolUseId': 'toolu_1' },
      },
    );
    expect(order).toEqual(['inbox', 'ack']);
    expect(persistChildResultInbox).toHaveBeenCalledWith(
      expect.objectContaining({ results: settledV2.results, toolCallId: 'toolu_1' }),
    );
    // Capability negotiation: the host asked for v2 because it can ack.
    expect(awaitChildren).toHaveBeenCalledWith(expect.objectContaining({ contractVersion: 2 }));
    expect(result.content[0]).toEqual({ text: 'child output', type: 'text' });
  });

  it('SA04-A: an inbox write failure refuses the result — nothing is acked', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ childOperationIds: ['child_1'], deferred: true, success: true });
    const awaitChildren = vi.fn().mockResolvedValue(settledV2);
    const ackChildResults = vi.fn();
    const extras = buildAcpBuiltinToolExtras(specs, {
      ackChildResults,
      awaitChildren,
      exec,
      persistChildResultInbox: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(result.isError).toBe(true);
    expect(ackChildResults).not.toHaveBeenCalled();
  });

  it('SA04-A: an ignored/lost ack is retried against the real receipt — never claimed consumed', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ childOperationIds: ['child_1'], deferred: true, success: true });
    const ackChildResults = vi
      .fn()
      // First ack response lost mid-flight; the next settle reports the true
      // state — already `acked` — which needs no second consume.
      .mockResolvedValueOnce({ acked: [], ignored: ['e_1'] });
    const awaitChildren = vi
      .fn()
      .mockResolvedValueOnce(settledV2)
      .mockResolvedValueOnce({
        ...settledV2,
        deliveries: [{ ...settledV2.deliveries[0], deliveryState: 'acked' as const }],
      });
    const extras = buildAcpBuiltinToolExtras(specs, {
      ackChildResults,
      awaitChildren,
      exec,
      persistChildResultInbox: vi.fn(),
    });

    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(awaitChildren).toHaveBeenCalledTimes(2);
    expect(ackChildResults).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('SA04-A: a host without the ack capability never claims a v2 settle as consumed', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ childOperationIds: ['child_1'], deferred: true, success: true });
    const awaitChildren = vi.fn().mockResolvedValue(settledV2);
    const extras = buildAcpBuiltinToolExtras(specs, { awaitChildren, exec });

    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(result.isError).toBe(true);
    // And it negotiated v1 — never asks for a contract it cannot honor.
    expect(awaitChildren).toHaveBeenCalledWith(expect.objectContaining({ contractVersion: 1 }));
  });

  it('SA04-A: a v1-shaped settle is never mistaken for v2 (mixed upgrade)', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ childOperationIds: ['child_1'], deferred: true, success: true });
    // Old server ignores the requested version — echoes v1 with no deliveries.
    const awaitChildren = vi.fn().mockResolvedValue({
      contractVersion: 1,
      results: [{ content: 'child output', operationId: 'child_1', status: 'done' }],
      status: 'settled',
    });
    const ackChildResults = vi.fn();
    const extras = buildAcpBuiltinToolExtras(specs, {
      ackChildResults,
      awaitChildren,
      exec,
    });

    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(result.isError).toBeUndefined();
    expect(ackChildResults).not.toHaveBeenCalled();
  });

  it('SA02-C: a pending-approval retry forwards the live windowId to the card', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: 'acp_tool_approval_pending', message: 'needs approval' },
        state: { toolApproval: { expiresAt: Date.now() + 60_000, windowId: 'w_live' } },
        success: false,
      })
      .mockResolvedValueOnce({ content: 'did the thing', success: true });
    const requestApproval = vi.fn().mockResolvedValue({ result: { approved: true } });
    const extras = buildAcpBuiltinToolExtras(specs, {
      awaitChildren: vi.fn(),
      exec,
      requestApproval,
    });

    const result = await extras[0].handler('op_1', { instruction: 'go' });
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: expect.any(String), windowId: 'w_live' }),
    );
    expect(result.isError).toBeUndefined();
  });
});
