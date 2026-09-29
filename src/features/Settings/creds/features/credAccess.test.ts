import { type OwnCredSummary } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { credsApiForRow, isActionableCredRow, isOwnCredRow } from './credAccess';

const baseCred = {
  createdAt: '2024-01-01T00:00:00.000Z',
  id: 'cred_1',
  key: 'GITHUB_TOKEN',
  name: 'GitHub',
  ownerUserId: 'user_100',
  type: 'kv-env' as const,
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const orgOwnedRow: OwnCredSummary = {
  ...baseCred,
  ownerType: 'organization',
};

const myOwnRow: OwnCredSummary = {
  ...baseCred,
  ownerType: 'user',
  ownerUserId: 'user_42',
};

const anotherMembersRow: OwnCredSummary = {
  ...baseCred,
  ownerType: 'user',
  ownerUserId: 'user_99',
};

const myUserId = 'user_42';

describe('isOwnCredRow', () => {
  it('is true for a "user"-owned row whose ownerUserId matches the signed-in user', () => {
    expect(isOwnCredRow(myOwnRow, myUserId)).toBe(true);
  });

  it("is false for another member's row even though ownerType is also 'user'", () => {
    expect(isOwnCredRow(anotherMembersRow, myUserId)).toBe(false);
  });

  it('is false for an org-owned row', () => {
    expect(isOwnCredRow(orgOwnedRow, myUserId)).toBe(false);
  });

  it('is false when the signed-in user id is unknown (not yet loaded)', () => {
    expect(isOwnCredRow(myOwnRow, undefined)).toBe(false);
  });
});

describe('isActionableCredRow', () => {
  it('is true for an org-owned row', () => {
    expect(isActionableCredRow(orgOwnedRow, myUserId)).toBe(true);
  });

  it("is true for the signed-in member's own row", () => {
    expect(isActionableCredRow(myOwnRow, myUserId)).toBe(true);
  });

  it("is false for another member's row — no endpoint can reach it", () => {
    expect(isActionableCredRow(anotherMembersRow, myUserId)).toBe(false);
  });
});

describe('credsApiForRow', () => {
  const contextApi = 'workspaceCreds' as const;
  const personalApi = 'creds' as const;

  it('routes an org-owned row to the context (workspace) API', () => {
    expect(credsApiForRow(orgOwnedRow, myUserId, contextApi, personalApi)).toBe(contextApi);
  });

  it("routes the signed-in member's own row to the personal API", () => {
    expect(credsApiForRow(myOwnRow, myUserId, contextApi, personalApi)).toBe(personalApi);
  });

  it("routes another member's row to the context API, not the personal one — the caller must gate on isActionableCredRow first and never call this for such a row in practice", () => {
    // credsApiForRow has no "no valid endpoint" return value, so this
    // documents the fallback rather than endorsing it: CredsList only calls
    // apiFor() after confirming isActionable(cred), so this branch is never
    // reached for another member's row in the real component.
    expect(credsApiForRow(anotherMembersRow, myUserId, contextApi, personalApi)).toBe(contextApi);
  });
});
