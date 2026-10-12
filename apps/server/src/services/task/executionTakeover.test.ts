import { describe, expect, it } from 'vitest';

import { mayTakeOverExecution } from './executionTakeover';

describe('mayTakeOverExecution', () => {
  const issue = { createdByUserId: 'user_creator' };

  it('lets the creator of the Issue take it over', () => {
    expect(mayTakeOverExecution({ issue, role: 'member', userId: 'user_creator' })).toBe(true);
  });

  it('lets a workspace owner or admin take over an Issue they did not create', () => {
    expect(mayTakeOverExecution({ issue, role: 'owner', userId: 'user_other' })).toBe(true);
    expect(mayTakeOverExecution({ issue, role: 'admin', userId: 'user_other' })).toBe(true);
  });

  it('leaves every other member to the ordinary agent-use check', () => {
    expect(mayTakeOverExecution({ issue, role: 'member', userId: 'user_other' })).toBe(false);
    expect(mayTakeOverExecution({ issue, role: 'viewer', userId: 'user_other' })).toBe(false);
    expect(mayTakeOverExecution({ issue, role: undefined, userId: 'user_other' })).toBe(false);
  });

  it('does not treat an Issue with no recorded creator as created by the caller', () => {
    expect(
      mayTakeOverExecution({ issue: { createdByUserId: null }, role: 'member', userId: '' }),
    ).toBe(false);
  });
});
