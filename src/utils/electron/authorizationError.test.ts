import { describe, expect, it } from 'vitest';

import { AUTHORIZATION_ERROR_I18N_KEY, readAuthorizationErrorCode } from './authorizationError';

describe('readAuthorizationErrorCode', () => {
  it.each(['timeout', 'network', 'invalid_url', 'denied', 'server_error'] as const)(
    'reads %s from a rejected error, a failed result and a broadcast payload',
    (code) => {
      expect(readAuthorizationErrorCode(Object.assign(new Error('text'), { code }))).toBe(code);
      expect(readAuthorizationErrorCode({ code, error: 'text', success: false })).toBe(code);
      expect(AUTHORIZATION_ERROR_I18N_KEY[code]).toMatch(/^screen5\.errors\./);
    },
  );

  it.each([
    ['an error without a code', new Error('Authorization timed out')],
    ['an unknown code', { code: 'ECONNREFUSED' }],
    ['an inherited property name', { code: 'toString' }],
    ['a non-string code', { code: 42 }],
    ['nothing', undefined],
  ])('returns undefined for %s', (_, source) => {
    expect(readAuthorizationErrorCode(source)).toBeUndefined();
  });
});
