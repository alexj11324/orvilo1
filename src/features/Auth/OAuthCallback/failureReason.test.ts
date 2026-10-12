import { describe, expect, it } from 'vitest';

import { resolveOAuthFailureReason } from './failureReason';

describe('resolveOAuthFailureReason', () => {
  it.each(['invalid_request', 'internal_error'] as const)('keeps the known reason %s', (reason) => {
    expect(resolveOAuthFailureReason(reason)).toBe(reason);
  });

  it.each([
    null,
    undefined,
    '',
    'access_denied',
    'Your account was suspended, call 555-0100',
    'toString',
  ])('never passes URL text through (%s)', (raw) => {
    expect(resolveOAuthFailureReason(raw)).toBe('unknown');
  });
});
