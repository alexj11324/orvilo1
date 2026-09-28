import { describe, expect, it } from 'vitest';

import type { RemovalPreview } from '../api/contract';
import { removalArmed } from './removalArmed';

const preview: RemovalPreview = {
  assignedTaskCount: 0,
  assignedTasks: [],
  reviewingTaskCount: 0,
  runningDelegationCount: 0,
  sharedDeviceCount: 0,
};

const base: Parameters<typeof removalArmed>[0] = {
  error: undefined,
  isLoading: false,
  mutating: false,
  preview,
};

describe('removalArmed', () => {
  it('arms only once the removal preview has landed', () => {
    expect(removalArmed(base)).toBe(true);
  });

  it.each<[string, Partial<typeof base>]>([
    ['still loading', { isLoading: true }],
    ['already mutating', { mutating: true }],
    ['preview failed', { error: new Error('boom'), preview: undefined }],
    ['preview absent', { preview: undefined }],
  ])('stays disarmed while %s', (_label, patch) => {
    expect(removalArmed({ ...base, ...patch })).toBe(false);
  });

  it('stays disarmed when the preview failed even if stale data lingers', () => {
    expect(removalArmed({ ...base, error: new Error('boom') })).toBe(false);
  });
});
