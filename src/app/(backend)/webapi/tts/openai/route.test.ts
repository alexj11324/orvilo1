import { describe, expect, it } from 'vitest';

import { POST } from './route';

describe('retired TTS route', () => {
  it('answers released clients with 410 instead of a 404', async () => {
    const response = await POST();

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ errorType: 'FeatureRetired' });
  });
});
