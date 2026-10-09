import { describe, expect, it } from 'vitest';

import { resolveIssueDetailCapabilities } from './issueDetailCapabilities';

describe('resolveIssueDetailCapabilities', () => {
  it('lets an editor add everything once the issue ids are loaded', () => {
    expect(
      resolveIssueDetailCapabilities({ allowed: true, hasDomainRevision: true, hasTaskId: true }),
    ).toEqual({
      canAddResource: true,
      canAddSubIssue: true,
      readOnly: false,
      resourceBlockedReason: undefined,
    });
  });

  it('keeps resource commands waiting, with a reason, until the revision arrives', () => {
    const caps = resolveIssueDetailCapabilities({
      allowed: true,
      hasDomainRevision: false,
      hasTaskId: true,
    });
    expect(caps.canAddResource).toBe(false);
    expect(caps.resourceBlockedReason).toBe('loading');
    expect(caps.canAddSubIssue).toBe(true);
    expect(caps.readOnly).toBe(false);
  });

  it('makes a viewer read-only with no add actions and carries the permission reason', () => {
    expect(
      resolveIssueDetailCapabilities({
        allowed: false,
        hasDomainRevision: true,
        hasTaskId: true,
        reason: 'View only',
      }),
    ).toEqual({
      canAddResource: false,
      canAddSubIssue: false,
      readOnly: true,
      readOnlyReason: 'View only',
    });
  });
});
