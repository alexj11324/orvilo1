import { describe, expect, it, vi } from 'vitest';

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
    expect(shape.name.safeParse('x').success).toBe(true);
    expect(shape.name.safeParse(1).success).toBe(false);
    expect(shape.name.safeParse(undefined).success).toBe(false);
    expect(shape.count.safeParse(undefined).success).toBe(true);
    expect(shape.count.safeParse(3).success).toBe(true);
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

    expect(shape.mode.safeParse('a').success).toBe(true);
    expect(shape.mode.safeParse('z').success).toBe(false);
    expect(shape.tags.safeParse([]).success).toBe(false);
    expect(shape.tags.safeParse(['x']).success).toBe(true);
    expect(shape.nested.safeParse({ flag: true }).success).toBe(true);
    expect(shape.nested.safeParse({}).success).toBe(false);
  });

  it('degrades unknown shapes to z.any()', () => {
    const shape = jsonSchemaToZodRawShape({
      properties: { whatever: { type: 'funky-type' } },
      type: 'object',
    });
    expect(shape.whatever.safeParse({ arbitrary: 1 }).success).toBe(true);
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
    expect(extras[0].inputSchema.instruction.safeParse('go').success).toBe(true);
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
});
