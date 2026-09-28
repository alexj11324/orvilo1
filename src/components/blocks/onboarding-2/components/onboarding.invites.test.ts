import { describe, expect, it } from 'vitest';

import { DEFAULT_INVITES } from './data';

// The invite step renders one input row per entry; an empty seed rendered only
// the column headers, leaving no field for the first invite.
describe('DEFAULT_INVITES', () => {
  it('seeds one blank invite row so the step renders an editable input', () => {
    expect(DEFAULT_INVITES.length).toBeGreaterThan(0);
  });

  it('seeds the row blank with the default member role', () => {
    for (const row of DEFAULT_INVITES) {
      expect(row.id).toBeTruthy();
      expect(row.email).toBe('');
      expect(row.role).toBe('member');
    }
  });
});
