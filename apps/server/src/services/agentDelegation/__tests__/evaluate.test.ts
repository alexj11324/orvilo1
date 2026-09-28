import { describe, expect, it } from 'vitest';

import { evaluateGrant, isEpochCurrent } from '../evaluate';
import type { EvaluatedGrant } from '../evaluate';

const NOW = new Date('2026-09-17T12:00:00Z');

const baseGrant = (overrides: Partial<EvaluatedGrant> = {}): EvaluatedGrant => ({
  allowedActions: ['run'],
  delegationSubjectId: 'user-1',
  delegationSubjectType: 'user',
  expiresAt: null,
  status: 'active',
  workspaceId: 'ws-1',
  ...overrides,
});

const evaluate = (grant: EvaluatedGrant | null | undefined, input = {}) =>
  evaluateGrant(grant, {
    action: 'run',
    now: NOW,
    subjectActive: true,
    workspaceId: 'ws-1',
    ...input,
  });

describe('evaluateGrant', () => {
  it('accepts an active grant with an allowed action and live subject', () => {
    expect(evaluate(baseGrant())).toEqual({ ok: true });
  });

  it('rejects a grant that does not exist', () => {
    expect(evaluate(null)).toEqual({ denial: 'foreign_workspace', ok: false });
  });

  it('rejects a grant from another workspace without leaking existence', () => {
    expect(evaluate(baseGrant({ workspaceId: 'ws-other' }))).toEqual({
      denial: 'foreign_workspace',
      ok: false,
    });
  });

  it.each(['revoked', 'expired'] as const)('rejects a %s grant', (status) => {
    expect(evaluate(baseGrant({ status }))).toEqual({ denial: 'not_active', ok: false });
  });

  it('rejects an expired grant (expiresAt in the past)', () => {
    const grant = baseGrant({ expiresAt: new Date(NOW.getTime() - 1000) });
    expect(evaluate(grant)).toEqual({ denial: 'expired', ok: false });
  });

  it('accepts a grant whose expiry is still in the future', () => {
    const grant = baseGrant({ expiresAt: new Date(NOW.getTime() + 60_000) });
    expect(evaluate(grant)).toEqual({ ok: true });
  });

  it('rejects an action outside allowedActions', () => {
    expect(evaluate(baseGrant(), { action: 'steer' })).toEqual({
      denial: 'action_not_allowed',
      ok: false,
    });
  });

  it('rejects when the delegation subject lost membership — never substitutes', () => {
    const verdict = evaluate(baseGrant(), { subjectActive: false });
    expect(verdict).toEqual({ denial: 'subject_inactive', ok: false });
  });

  it('rejects a user-subject grant with no subject recorded', () => {
    expect(evaluate(baseGrant({ delegationSubjectId: null }))).toEqual({
      denial: 'subject_missing',
      ok: false,
    });
  });

  it('rejects a null or empty action whitelist fail-closed', () => {
    expect(evaluate(baseGrant({ allowedActions: null }))).toEqual({
      denial: 'action_not_allowed',
      ok: false,
    });
    expect(evaluate(baseGrant({ allowedActions: [] }))).toEqual({
      denial: 'action_not_allowed',
      ok: false,
    });
  });
});

describe('isEpochCurrent (fencing)', () => {
    const topic = { executionEpoch: 3, executionGrantId: 'grant-1' };

  it('accepts the current epoch bound to the same grant', () => {
    expect(isEpochCurrent(topic, { epoch: 3, grantId: 'grant-1' })).toBe(true);
  });

  it('fences a stale epoch even when the grant matches', () => {
    expect(isEpochCurrent(topic, { epoch: 2, grantId: 'grant-1' })).toBe(false);
  });

  it('fences the current epoch when bound to a different grant', () => {
    expect(isEpochCurrent(topic, { epoch: 3, grantId: 'grant-2' })).toBe(false);
  });

  it('fences a missing topic row', () => {
    expect(isEpochCurrent(null, { epoch: 3, grantId: 'grant-1' })).toBe(false);
    expect(isEpochCurrent(undefined, { epoch: 3, grantId: 'grant-1' })).toBe(false);
  });
});
