import { describe, expect, it } from 'vitest';

import { linearBindingControlsSchema } from './linearSync';

describe('linearBindingControlsSchema', () => {
  it('accepts one independent rollout control with an optimistic version', () => {
    expect(
      linearBindingControlsSchema.parse({
        expectedVersion: 2,
        id: '00000000-0000-4000-8000-000000000001',
        writeEnabled: false,
      }),
    ).toMatchObject({ writeEnabled: false });
  });

  it('rejects an empty control update', () => {
    expect(() =>
      linearBindingControlsSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow('A rollout control is required');
  });
});
