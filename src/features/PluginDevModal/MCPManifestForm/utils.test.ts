import { createFormControl } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import {
  createMcpDevDefaults,
  getMcpDevActiveFields,
  getMcpDevPayload,
  getMcpDevTestFields,
  isMcpRequiredValuePresent,
  type McpDevFormValues,
  McpParseErrorCode,
  mergeMcpDevValues,
  parseMcpInput,
  setMcpDevValues,
  validateMcpIdentifier,
  validateMcpUrl,
} from './utils';

describe('parseMcpInput', () => {
  // Test Suite 1: Valid Nested mcpServers Structure
  describe('Nested mcpServers Structure', () => {
    it('should correctly parse valid stdio config', () => {
      const input = JSON.stringify({
        mcpServers: {
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
        },
      });
      const expected = {
        status: 'success',
        identifier: 'sequential-thinking',
        mcpConfig: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          type: 'stdio',
        },
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should correctly parse valid http config', () => {
      const input = JSON.stringify({
        mcpServers: {
          'some-http-service': {
            url: 'https://example.com/api',
          },
        },
      });
      const expected = {
        status: 'success',
        identifier: 'some-http-service',
        mcpConfig: {
          url: 'https://example.com/api',
          type: 'http',
        },
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should correctly parse valid http config with empty string identifier', () => {
      const input = JSON.stringify({
        mcpServers: {
          '': {
            url: 'https://router.mcp.so/mcp/mdvp27m9tl2bxs',
          },
        },
      });
      const expected = {
        status: 'success',
        identifier: '',
        mcpConfig: {
          url: 'https://router.mcp.so/mcp/mdvp27m9tl2bxs',
          type: 'http',
        },
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error for empty mcpServers object', () => {
      const input = JSON.stringify({ mcpServers: {} });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.EmptyMcpServers,
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error for invalid structure within mcpServers config', () => {
      const input = JSON.stringify({
        mcpServers: {
          'invalid-config': {}, // Missing command/args or url
        },
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'invalid-config',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error if mcpConfig is not an object', () => {
      const input = JSON.stringify({
        mcpServers: {
          'not-an-object': 'hello',
        },
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'not-an-object',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error if mcpConfig is null', () => {
      const input = JSON.stringify({
        mcpServers: {
          'is-null': null,
        },
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'is-null',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });
  });

  // Test Suite 2: Valid Flat Structure (Top-level Identifier)
  describe('Flat Structure (Top-level Identifier)', () => {
    it('should correctly parse valid stdio config', () => {
      const input = JSON.stringify({
        'flat-stdio-service': {
          command: 'go',
          args: ['run', 'main.go'],
        },
      });
      const expected = {
        status: 'success',
        identifier: 'flat-stdio-service',
        mcpConfig: {
          command: 'go',
          args: ['run', 'main.go'],
          type: 'stdio',
        },
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should correctly parse valid http config', () => {
      const input = JSON.stringify({
        'mcp-wolframalpha': {
          url: 'https://mcp.higress.ai/mcp-wolframalpha/abc',
        },
      });
      const expected = {
        status: 'success',
        identifier: 'mcp-wolframalpha',
        mcpConfig: {
          url: 'https://mcp.higress.ai/mcp-wolframalpha/abc',
          type: 'http',
        },
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error for invalid structure within flat config', () => {
      const input = JSON.stringify({
        'invalid-flat': {}, // Missing command/args or url
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'invalid-flat',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error if the value associated with the identifier is not an object', () => {
      const input = JSON.stringify({
        'flat-not-object': 'just a string',
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'flat-not-object',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error if the value associated with the identifier is null', () => {
      const input = JSON.stringify({
        'flat-is-null': null,
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidMcpStructure,
        identifier: 'flat-is-null',
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return error for multiple top-level keys', () => {
      const input = JSON.stringify({
        key1: { url: 'url1' },
        key2: { url: 'url2' },
      });
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidJsonStructure, // Because it's not a single-key flat structure nor mcpServers/manifest
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });
  });

  // Test Suite 4: Invalid Inputs and Edge Cases
  describe('Invalid Inputs and Edge Cases', () => {
    it('should return noop for invalid JSON string', () => {
      const input = 'this is not json';
      const expected = { status: 'noop' };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return noop for empty string', () => {
      const input = '';
      const expected = { status: 'noop' };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return noop for null input', () => {
      // @ts-ignore testing invalid input type
      const input = null;
      const expected = { status: 'noop' };
      expect(parseMcpInput(input as any)).toEqual(expected);
    });

    it('should return noop for undefined input', () => {
      // @ts-ignore testing invalid input type
      const input = undefined;
      const expected = { status: 'noop' };
      expect(parseMcpInput(input as any)).toEqual(expected);
    });

    it('should return InvalidJsonStructure for empty JSON object', () => {
      const input = JSON.stringify({});
      // Empty object is considered an invalid structure because it doesn't match any expected format
      const expected = {
        status: 'error',
        errorCode: McpParseErrorCode.InvalidJsonStructure,
      };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return noop for JSON array', () => {
      const input = JSON.stringify([]);
      const expected = { status: 'noop' };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return noop for JSON primitive (string)', () => {
      const input = JSON.stringify('just a string');
      const expected = { status: 'noop' };
      expect(parseMcpInput(input)).toEqual(expected);
    });

    it('should return noop for JSON primitive (number)', () => {
      const input = JSON.stringify(123);
      const expected = { status: 'noop' };
      expect(parseMcpInput(input)).toEqual(expected);
    });
  });
});

describe('MCP editor draft and mounted-field payload contract', () => {
  it('starts HTTP with no auth and keeps values raw', () => {
    const defaults = createMcpDevDefaults();
    expect(defaults).toEqual({ customParams: { mcp: { auth: { type: 'none' }, type: 'http' } } });
    const seeded = mergeMcpDevValues(defaults, {
      identifier: 'raw-id',
      customParams: {
        description: '  description  ',
        mcp: { url: ' https://example.com/mcp ' },
      },
    });
    expect(getMcpDevPayload(seeded).customParams.description).toBe('  description  ');
    expect(getMcpDevPayload(seeded).customParams.mcp).toEqual({
      type: 'http',
      url: ' https://example.com/mcp ',
      headers: undefined,
      auth: { type: 'none' },
    });
  });

  it('deep-merges auth/records, replaces argument arrays and does not mutate drafts', () => {
    const prior: McpDevFormValues = {
      customParams: {
        description: 'keep',
        mcp: {
          type: 'stdio',
          args: ['old', 'tail'],
          env: { KEEP: '1', CHANGE: 'old' },
          headers: { Authorization: 'old', KEEP: 'header' },
          auth: { type: 'bearer', token: 'keep-token' },
        },
      },
    };
    const patch: McpDevFormValues = {
      customParams: {
        mcp: {
          args: ['new'],
          env: { CHANGE: 'new' },
          headers: { Authorization: 'new' },
          auth: { type: 'none' },
        },
      },
    };
    const merged = mergeMcpDevValues(prior, patch);
    expect(merged.customParams?.mcp).toEqual({
      type: 'stdio',
      args: ['new'],
      env: { KEEP: '1', CHANGE: 'new' },
      headers: { Authorization: 'new', KEEP: 'header' },
      auth: { type: 'none', token: 'keep-token' },
    });
    expect(merged.customParams?.description).toBe('keep');
    expect(prior.customParams?.mcp?.args).toEqual(['old', 'tail']);
  });

  it('retains hidden credentials/drafts but excludes them from HTTP and stdio submissions', () => {
    const values: McpDevFormValues = {
      identifier: 'id',
      type: 'customPlugin',
      customParams: {
        mcp: {
          type: 'http',
          url: 'https://example.com',
          command: 'npx',
          args: ['-y'],
          env: { KEY: 'value' },
          headers: { Header: 'value' },
          auth: {
            type: 'none',
            token: 'hidden',
            clientId: 'hidden-id',
            clientSecret: 'hidden-secret',
            accessToken: 'hidden-access',
          },
        },
      },
    };
    const http = getMcpDevPayload(values, true);
    expect(http.customParams.mcp).toEqual({
      type: 'http',
      url: 'https://example.com',
      headers: { Header: 'value' },
      auth: { type: 'none' },
    });
    expect(http).not.toHaveProperty('type');
    const stdioDraft = mergeMcpDevValues(values, { customParams: { mcp: { type: 'stdio' } } });
    expect(getMcpDevPayload(stdioDraft, true).customParams.mcp).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y'],
      env: { KEY: 'value' },
    });
    expect(stdioDraft.customParams?.mcp?.auth?.token).toBe('hidden');
    expect(
      getMcpDevPayload(mergeMcpDevValues(stdioDraft, { customParams: { mcp: { type: 'http' } } }))
        .customParams.mcp.url,
    ).toBe('https://example.com');
  });

  it('includes bearer token only for bearer and OAuth fields only when OAuth is exposed', () => {
    const bearer: McpDevFormValues = {
      customParams: {
        mcp: {
          type: 'http',
          auth: {
            type: 'bearer',
            token: 'raw-token',
            clientId: 'retained-id',
            clientSecret: 'retained-secret',
          },
        },
      },
    };
    expect(getMcpDevPayload(bearer).customParams.mcp.auth).toEqual({
      type: 'bearer',
      token: 'raw-token',
    });
    const oauth = mergeMcpDevValues(bearer, {
      customParams: { mcp: { auth: { type: 'oauth2' } } },
    });
    expect(getMcpDevPayload(oauth, false).customParams.mcp.auth).toEqual({ type: 'oauth2' });
    expect(getMcpDevPayload(oauth, true).customParams.mcp.auth).toEqual({
      type: 'oauth2',
      clientId: 'retained-id',
      clientSecret: 'retained-secret',
    });
  });

  it('preserves explicitly undefined field/parent resets without filling old credentials', () => {
    const values: McpDevFormValues = {
      identifier: 'old',
      customParams: {
        mcp: {
          type: 'http',
          url: 'old',
          auth: { type: 'bearer', token: 'old' },
        },
      },
    };
    expect(mergeMcpDevValues(values, { identifier: undefined }).identifier).toBeUndefined();
    expect(
      mergeMcpDevValues(values, { customParams: { mcp: { auth: { token: undefined } } } })
        .customParams?.mcp?.auth,
    ).toEqual({ type: 'bearer', token: undefined });
    expect(
      mergeMcpDevValues(values, { customParams: { mcp: undefined } }).customParams?.mcp,
    ).toBeUndefined();
    expect(mergeMcpDevValues(values, { customParams: undefined }).customParams).toBeUndefined();
  });

  it('validates connection fields independently of an identifier and optional metadata', () => {
    expect(getMcpDevTestFields(createMcpDevDefaults())).toEqual([
      'customParams.mcp.url',
      'customParams.mcp.auth.type',
    ]);
    expect(
      getMcpDevTestFields({ customParams: { mcp: { type: 'http', auth: { type: 'bearer' } } } }),
    ).toEqual([
      'customParams.mcp.url',
      'customParams.mcp.auth.type',
      'customParams.mcp.auth.token',
    ]);
    expect(getMcpDevTestFields({ customParams: { mcp: { type: 'stdio' } } })).toEqual([
      'customParams.mcp.command',
      'customParams.mcp.args',
    ]);
    expect(getMcpDevActiveFields({ customParams: { mcp: { type: 'stdio' } } })).not.toContain(
      'customParams.mcp.url',
    );
  });

  it('keeps manifest objects and editable metadata intact', () => {
    const manifest = {
      api: [],
      identifier: 'manifest-id',
      meta: { title: 'Fixture' },
      type: 'default',
    } as NonNullable<McpDevFormValues['manifest']>;
    const values = mergeMcpDevValues(createMcpDevDefaults(), {
      manifest,
      customParams: { avatar: 'avatar', description: 'description' },
    });
    const payload = getMcpDevPayload(values);
    expect(payload.manifest).toEqual(manifest);
    expect(payload.customParams.avatar).toBe('avatar');
    expect(payload.customParams.description).toBe('description');
  });
});

describe('MCP raw validation contract', () => {
  it.each([undefined, null, ''])('rejects missing identifier %s', (value) => {
    expect(validateMcpIdentifier(value, [])).toBe('dev.mcp.identifier.required');
  });
  it.each(['with space', 'dot.name', '中文'])('rejects invalid identifier %s', (value) => {
    expect(validateMcpIdentifier(value, [])).toBe('dev.mcp.identifier.invalid');
  });
  it('requires unique identifiers only while creating', () => {
    expect(validateMcpIdentifier('a-b_1', ['a-b_1'])).toBe('dev.meta.identifier.errorDuplicate');
    expect(validateMcpIdentifier('a-b_1', ['a-b_1'], true)).toBeUndefined();
    expect(validateMcpIdentifier('a-b_2', ['a-b_1'])).toBeUndefined();
  });
  it.each([
    'https://example.com',
    'mailto:server@example.com',
    'file:///tmp/mcp',
    ' https://example.com ',
  ])('accepts the original new URL protocol contract: %s', (value) => {
    expect(validateMcpUrl(value)).toBeUndefined();
  });
  it.each([undefined, null, ''])('requires a URL %s', (value) => {
    expect(validateMcpUrl(value)).toBe('dev.mcp.url.required');
  });
  it('rejects relative/malformed URLs without coercing raw values', () => {
    expect(validateMcpUrl('/relative')).toBe('dev.mcp.url.invalid');
    expect(validateMcpUrl('not a url')).toBe('dev.mcp.url.invalid');
  });
  it('keeps original required-array and whitespace behavior', () => {
    expect(isMcpRequiredValuePresent([])).toBe(false);
    expect(isMcpRequiredValuePresent([''])).toBe(true);
    expect(isMcpRequiredValuePresent('  ')).toBe(true);
    expect(isMcpRequiredValuePresent(undefined)).toBe(false);
  });
});

describe('actual public RHF programmatic and user-change paths', () => {
  it('does not emit user edits when seeding/importing and only clears changed field errors', async () => {
    const form = createFormControl<McpDevFormValues>({
      defaultValues: createMcpDevDefaults(),
      mode: 'onChange',
      shouldUnregister: false,
    });
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: () => {} });
    const identifier = form.register('identifier');
    form.register('customParams.mcp.url');
    const events: string[] = [];
    const watch = form.watch((_, info) => {
      if (info.type === 'change') events.push(info.name ?? '');
    });
    form.setError('identifier', { type: 'duplicate', message: 'duplicate' });
    form.setError('customParams.mcp.url', { type: 'required', message: 'url' });
    setMcpDevValues(form, { identifier: 'seeded' });
    expect(events).toEqual([]);
    expect(form.getValues('identifier')).toBe('seeded');
    expect(form.getFieldState('identifier').error).toBeUndefined();
    expect(form.getFieldState('customParams.mcp.url').error?.message).toBe('url');
    await identifier.onChange({ target: { name: 'identifier', value: 'edited' }, type: 'change' });
    expect(events).toEqual(['identifier']);
    expect(getMcpDevPayload(form.getValues()).identifier).toBe('edited');
    watch.unsubscribe();
    unsubscribe();
  });

  it('does not discard hidden drafts and supports a real mounted-field validation boundary', async () => {
    const form = createFormControl<McpDevFormValues>({
      defaultValues: createMcpDevDefaults(),
      shouldUnregister: false,
    });
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: () => {} });
    form.register('customParams.mcp.url', { validate: (value) => validateMcpUrl(value) ?? true });
    setMcpDevValues(form, { customParams: { mcp: { url: 'invalid', args: ['keep'] } } });
    expect(await form.trigger('customParams.mcp.url')).toBe(false);
    setMcpDevValues(form, { customParams: { mcp: { url: 'https://example.com' } } });
    expect(await form.trigger('customParams.mcp.url')).toBe(true);
    expect(form.getValues('customParams.mcp.args')).toEqual(['keep']);
    form.unregister('customParams.mcp.url', { keepValue: true, keepDefaultValue: true });
    setMcpDevValues(form, { customParams: { mcp: { type: 'stdio' } } });
    expect(getMcpDevPayload(form.getValues()).customParams.mcp).not.toHaveProperty('url');
    expect(form.getValues('customParams.mcp.url')).toBe('https://example.com');
    unsubscribe();
  });
});

describe('advanced editor mounted-field projection', () => {
  it('retains closed headers drafts while excluding them from the actual current submit/test payload', () => {
    const values = mergeMcpDevValues(createMcpDevDefaults(), {
      customParams: { mcp: { headers: { X: 'keep' } } },
    });
    const closed = getMcpDevActiveFields(values).filter(
      (name) => name !== 'customParams.mcp.headers',
    );
    expect(getMcpDevPayload(values, false, closed).customParams.mcp).not.toHaveProperty('headers');
    expect(values.customParams?.mcp?.headers).toEqual({ X: 'keep' });
    expect(
      getMcpDevPayload(values, false, [...closed, 'customParams.mcp.headers']).customParams.mcp
        .headers,
    ).toEqual({ X: 'keep' });
  });
});

describe('external-value error/manifest merge contract', () => {
  it('retains unmodified field errors and clears an explicitly emptied parent field error', () => {
    const form = createFormControl<McpDevFormValues>({
      defaultValues: { identifier: 'same', customParams: { mcp: { type: 'http', url: 'url' } } },
    });
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: () => {} });
    form.register('identifier');
    form.register('customParams.mcp.url');
    form.setError('identifier', { type: 'duplicate', message: 'same-error' });
    form.setError('customParams.mcp.url', { type: 'invalid', message: 'url-error' });
    setMcpDevValues(form, { identifier: 'same' });
    expect(form.getFieldState('identifier').error?.message).toBe('same-error');
    setMcpDevValues(form, { customParams: undefined });
    expect(form.getFieldState('customParams.mcp.url').error).toBeUndefined();
    unsubscribe();
  });

  it('deep-merges fetched manifest metadata but replaces its API array', () => {
    const prior: NonNullable<McpDevFormValues['manifest']> = {
      api: [{ name: 'old', description: 'Old API', parameters: {} }],
      identifier: 'manifest-id',
      meta: { title: 'Keep title', description: 'old', avatar: 'keep-avatar' },
    };
    const fetched: NonNullable<McpDevFormValues['manifest']> = {
      api: [],
      identifier: 'manifest-id',
      meta: { title: 'Keep title', description: 'new' },
    };
    const values = mergeMcpDevValues({ manifest: prior }, { manifest: fetched });
    expect(values.manifest).toEqual({
      api: [],
      identifier: 'manifest-id',
      meta: { title: 'Keep title', description: 'new', avatar: 'keep-avatar' },
    });
    expect(prior.api).toEqual([{ name: 'old', description: 'Old API', parameters: {} }]);
  });
});
