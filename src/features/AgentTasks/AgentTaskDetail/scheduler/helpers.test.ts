import { describe, expect, it } from 'vitest';

import { normalizeHeartbeatInterval } from './helpers';

describe('normalizeHeartbeatInterval', () => {
  it('uses the same ten-minute floor for preview and persistence', () => {
    expect(normalizeHeartbeatInterval(1, 'minutes')).toBe(600);
    expect(normalizeHeartbeatInterval(1, 'hours')).toBe(3600);
    expect(normalizeHeartbeatInterval(10.1, 'minutes')).toBe(660);
  });
});
