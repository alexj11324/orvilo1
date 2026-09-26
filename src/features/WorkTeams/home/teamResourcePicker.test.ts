import { describe, expect, it } from 'vitest';

import { isPublicDocument } from './teamResourcePicker';

describe('team resource document picker', () => {
  it('offers only public documents for team attachment', () => {
    expect(isPublicDocument({ visibility: 'public' })).toBe(true);
    expect(isPublicDocument({ visibility: 'private' })).toBe(false);
    expect(isPublicDocument({ visibility: 'team' })).toBe(false);
  });
});
