import { describe, expect, it } from 'vitest';

import { linearCreateTriageStatus } from './linearCreateTriageStatus';

describe('linearCreateTriageStatus', () => {
  it('does not put historical imports into untriaged intake', () => {
    expect(linearCreateTriageStatus(true)).toBe('accepted');
    expect(linearCreateTriageStatus(false)).toBeUndefined();
  });
});
