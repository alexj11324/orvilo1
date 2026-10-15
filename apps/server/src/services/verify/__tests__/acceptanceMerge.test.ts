// @vitest-environment node
import type { VerifyCheckItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AcceptanceItem,
  VerifyCheckResultItem,
  VerifyRunItem,
} from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';

import {
  collectCheckIds,
  countLogicalChecks,
  mergeAcceptanceRounds,
  planCheckIdRemap,
  remapPlanItem,
} from '../acceptanceMerge';

const mocks = vi.hoisted(() => ({
  acceptanceDelete: vi.fn(),
  acceptanceUpdate: vi.fn(),
  attachToAcceptance: vi.fn(),
  listByAcceptance: vi.fn(),
  listByRuns: vi.fn(),
  resultUpdate: vi.fn(),
  runUpdate: vi.fn(),
}));

vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return {
      attachToAcceptance: mocks.attachToAcceptance,
      listByAcceptance: mocks.listByAcceptance,
      update: mocks.runUpdate,
    };
  }),
}));

vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return {
      listByRuns: mocks.listByRuns,
      update: mocks.resultUpdate,
    };
  }),
}));

vi.mock('@/database/models/acceptance', () => ({
  AcceptanceModel: vi.fn(function () {
    return {
      delete: mocks.acceptanceDelete,
      update: mocks.acceptanceUpdate,
    };
  }),
}));

const planItem = (id: string, overrides: Partial<VerifyCheckItem> = {}): VerifyCheckItem => ({
  id,
  index: 0,
  onFail: 'manual',
  required: true,
  title: `check ${id}`,
  verifierConfig: {},
  verifierType: 'agent',
  ...overrides,
});

const run = (id: string, roundIndex: number, plan: VerifyCheckItem[]): VerifyRunItem =>
  ({ id, plan, roundIndex }) as VerifyRunItem;

const result = (id: string, verifyRunId: string, checkItemId: string): VerifyCheckResultItem =>
  ({ checkItemId, id, verifyRunId }) as VerifyCheckResultItem;

const acceptance = (id: string, overrides: Partial<AcceptanceItem> = {}): AcceptanceItem =>
  ({ config: {}, id, status: 'delivered', visibility: 'private', ...overrides }) as AcceptanceItem;

const SOURCE_ID = '11111111-2222-3333-4444-555555555555';
const TARGET_ID = '99999999-8888-7777-6666-555555555555';

/** How many rounds the unscoped integrity count sees still chained to the source. */
let leftBehindRounds = 0;

/**
 * `db.transaction(fn)` runs its body inline — the models are mocked, so the only
 * real query in the body is the unscoped left-behind count.
 */
const fakeDb = {
  transaction: (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: async () => [{ value: leftBehindRounds }] }),
      }),
    }),
} as unknown as OrviloDatabase;

const mergeWith = (source: AcceptanceItem, target: AcceptanceItem) =>
  mergeAcceptanceRounds({ db: fakeDb, source, target, userId: 'user-1' });

beforeEach(() => {
  vi.clearAllMocks();
  leftBehindRounds = 0;
  mocks.listByAcceptance.mockResolvedValue([]);
  mocks.listByRuns.mockResolvedValue([]);
  mocks.attachToAcceptance.mockResolvedValue({});
});

describe('planCheckIdRemap', () => {
  it('re-keys only the ids the target already uses', () => {
    const remap = planCheckIdRemap(['case-1', 'case-2'], new Set(['case-1']), 'abcd1234');

    expect(remap.get('case-1')).toBe('case-1~abcd1234');
    expect(remap.has('case-2')).toBe(false);
  });

  it('keeps generating until the replacement is free on both sides', () => {
    const remap = planCheckIdRemap(
      ['case-1', 'case-1~abcd1234'],
      new Set(['case-1', 'case-1~abcd1234']),
      'abcd1234',
    );

    // The obvious replacement is itself a source id, so it must not be reused.
    expect(remap.get('case-1')).toBe('case-1~abcd1234-2');
    expect(remap.get('case-1~abcd1234')).toBe('case-1~abcd1234~abcd1234');
  });
});

describe('collectCheckIds', () => {
  it('collects plan ids, their logical criterion ids and result-only ids', () => {
    const ids = collectCheckIds(
      [run('run-1', 1, [planItem('plan-1', { sourceCriterionId: 'criterion-a' })])],
      [result('res-1', 'run-1', 'ingested-only')],
    );

    expect([...ids].sort()).toEqual(['criterion-a', 'ingested-only', 'plan-1']);
  });
});

describe('countLogicalChecks', () => {
  it('counts one check once even when it carries a separate criterion id', () => {
    // `collectCheckIds` holds both ids for collision purposes — the user-facing
    // count must not read that as two checks.
    const runs = [run('run-1', 1, [planItem('plan-1', { sourceCriterionId: 'criterion-a' })])];

    expect(collectCheckIds(runs, []).size).toBe(2);
    expect(countLogicalChecks(runs, [])).toBe(1);
  });

  it('does not count a generation folded away by supersedes', () => {
    const runs = [
      run('run-1', 1, [planItem('old')]),
      run('run-2', 2, [planItem('new', { supersedes: ['old'] })]),
    ];

    expect(countLogicalChecks(runs, [])).toBe(1);
  });

  it('counts a result that names an item no plan carries', () => {
    expect(
      countLogicalChecks(
        [run('run-1', 1, [planItem('planned')])],
        [result('res-1', 'run-1', 'ingested-only')],
      ),
    ).toBe(2);
  });
});

describe('remapPlanItem', () => {
  it('rewrites the item id, its criterion id and its supersedes references', () => {
    const remap = new Map([
      ['a', 'a~m'],
      ['old', 'old~m'],
      ['crit', 'crit~m'],
    ]);

    expect(
      remapPlanItem(
        planItem('a', { sourceCriterionId: 'crit', supersedes: ['old', 'untouched'] }),
        remap,
      ),
    ).toMatchObject({
      id: 'a~m',
      sourceCriterionId: 'crit~m',
      supersedes: ['old~m', 'untouched'],
    });
  });
});

it('does not merge or delete historical Acceptance rounds', async () => {
  await expect(mergeWith(acceptance(SOURCE_ID), acceptance(TARGET_ID))).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  expect(mocks.attachToAcceptance).not.toHaveBeenCalled();
  expect(mocks.acceptanceDelete).not.toHaveBeenCalled();
});
