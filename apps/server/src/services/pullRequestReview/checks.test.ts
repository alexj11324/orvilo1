import { describe, expect, it } from 'vitest';

import { aggregateChecks, normalizeCheck, type RawCheckContext } from './checks';

const summarize = (checks: RawCheckContext[], complete = true) =>
  aggregateChecks(
    checks.map((check) => normalizeCheck(check)),
    { complete },
  );

describe('normalizeCheck', () => {
  it('normalizes a CheckRun by status and conclusion', () => {
    expect(
      normalizeCheck({
        __typename: 'CheckRun',
        conclusion: 'SUCCESS',
        name: 'ci',
        status: 'COMPLETED',
      }).status,
    ).toBe('passed');
    expect(
      normalizeCheck({
        __typename: 'CheckRun',
        conclusion: 'FAILURE',
        name: 'ci',
        status: 'COMPLETED',
      }).status,
    ).toBe('failing');
    expect(
      normalizeCheck({ __typename: 'CheckRun', conclusion: null, name: 'ci', status: 'QUEUED' })
        .status,
    ).toBe('pending');
    expect(
      normalizeCheck({
        __typename: 'CheckRun',
        conclusion: null,
        name: 'ci',
        status: 'IN_PROGRESS',
      }).status,
    ).toBe('pending');
    // COMPLETED with a missing conclusion is not a pass.
    expect(
      normalizeCheck({ __typename: 'CheckRun', conclusion: null, name: 'ci', status: 'COMPLETED' })
        .status,
    ).toBe('unknown');
  });

  it('normalizes a legacy StatusContext where FAILURE lives in `state`', () => {
    expect(
      normalizeCheck({ __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE' }),
    ).toMatchObject({ name: 'ci/legacy', status: 'failing' });
    expect(
      normalizeCheck({ __typename: 'StatusContext', context: 'ci/legacy', state: 'SUCCESS' })
        .status,
    ).toBe('passed');
    expect(
      normalizeCheck({ __typename: 'StatusContext', context: 'ci/legacy', state: 'PENDING' })
        .status,
    ).toBe('pending');
    expect(
      normalizeCheck({ __typename: 'StatusContext', context: 'ci/legacy', state: 'EXPECTED' })
        .status,
    ).toBe('pending');
    expect(
      normalizeCheck({ __typename: 'StatusContext', context: 'ci/legacy', state: 'ERROR' }).status,
    ).toBe('failing');
    // StatusContext detected without a __typename hint (state set, no status).
    expect(normalizeCheck({ context: 'ci', state: 'FAILURE' }).status).toBe('failing');
  });
});

describe('aggregateChecks', () => {
  it('does not report queued checks as passing (RV06 regression)', () => {
    const summary = summarize([{ conclusion: null, name: 'ci', status: 'QUEUED' }]);
    expect(summary.state).toBe('pending');
    expect(summary.state).not.toBe('passed');
    expect(summary.pending).toBe(1);
  });

  it('reports a legacy FAILURE status context as failing', () => {
    const summary = summarize([
      { __typename: 'StatusContext', conclusion: null, context: 'ci', state: 'FAILURE' },
    ]);
    expect(summary.state).toBe('failing');
    expect(summary.failing).toBe(1);
  });

  it('marks incomplete pages as partial instead of green', () => {
    const summary = summarize(
      [{ conclusion: 'SUCCESS', name: 'ci', status: 'COMPLETED' }],
      /* complete */ false,
    );
    expect(summary.state).toBe('partial');
  });

  it('reports unknown when no check data exists', () => {
    expect(summarize([]).state).toBe('unknown');
    expect(summarize([], false).state).toBe('unknown');
  });

  it('reports passed only when every loaded check passed', () => {
    const summary = summarize([
      { conclusion: 'SUCCESS', name: 'a', status: 'COMPLETED' },
      { conclusion: 'SKIPPED', name: 'b', status: 'COMPLETED' },
    ]);
    expect(summary.state).toBe('passed');
    expect(summary.passed).toBe(2);
  });

  it('treats unclassifiable checks as unknown rather than passed', () => {
    const summary = summarize([{ conclusion: null, name: 'a', status: 'COMPLETED' }]);
    expect(summary.state).toBe('unknown');
    expect(summary.unknown).toBe(1);
  });

  it('failing beats partial even when the page is incomplete', () => {
    const summary = summarize(
      [
        { conclusion: 'FAILURE', name: 'a', status: 'COMPLETED' },
        { conclusion: null, name: 'b', status: 'QUEUED' },
      ],
      false,
    );
    expect(summary.state).toBe('failing');
  });
});
