import { CLIENT_VERSION_HEADER, CURRENT_VERSION } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import { createHeaderWithAuth } from '../_auth';

describe('createHeaderWithAuth', () => {
  it('should include the current web client version', async () => {
    const headers = await createHeaderWithAuth();

    expect(headers).toEqual({
      [CLIENT_VERSION_HEADER]: CURRENT_VERSION,
    });
  });

  it('should preserve request headers without allowing a client version override', async () => {
    const headers = await createHeaderWithAuth({
      headers: {
        'X-Orvilo-Client-Version': 'spoofed',
        'Content-Type': 'application/json',
      },
    });
    const normalizedHeaders = new Headers(headers);

    expect(normalizedHeaders.get(CLIENT_VERSION_HEADER)).toBe(CURRENT_VERSION);
    expect(normalizedHeaders.get('content-type')).toBe('application/json');
  });
});
