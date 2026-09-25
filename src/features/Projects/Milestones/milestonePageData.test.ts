import { describe, expect, it } from 'vitest';

import {
  compareMilestonesForList,
  milestoneProgressView,
  sortMilestonesForList,
} from './milestonePageData';

describe('compareMilestonesForList', () => {
  it('orders milestones chronologically by target date', () => {
    expect(
      compareMilestonesForList({ date: '2026-12-01', id: 'b' }, { date: '2026-03-15', id: 'a' }),
    ).toBeGreaterThan(0);
    expect(
      compareMilestonesForList({ date: '2026-03-15', id: 'a' }, { date: '2026-12-01', id: 'b' }),
    ).toBeLessThan(0);
  });

  it('sinks undated milestones below dated ones regardless of sort order', () => {
    // Manual order says the undated milestone comes first; the timeline still
    // cannot place it, so it goes last.
    expect(
      compareMilestonesForList(
        { date: null, id: 'a', sortOrder: 0 },
        { date: '2030-01-01', id: 'b', sortOrder: 9 },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareMilestonesForList(
        { date: '2030-01-01', id: 'b', sortOrder: 9 },
        { date: null, id: 'a', sortOrder: 0 },
      ),
    ).toBeLessThan(0);
  });

  it('breaks date ties with the project sort order, then id', () => {
    expect(
      compareMilestonesForList(
        { date: '2026-06-01', id: 'a', sortOrder: 2 },
        { date: '2026-06-01', id: 'b', sortOrder: 1 },
      ),
    ).toBeGreaterThan(0);
    // Same date and same order still need a total ordering for stable renders.
    expect(
      compareMilestonesForList(
        { date: '2026-06-01', id: 'a', sortOrder: 1 },
        { date: '2026-06-01', id: 'b', sortOrder: 1 },
      ),
    ).toBeLessThan(0);
    expect(compareMilestonesForList({ id: 'a' }, { id: 'a' })).toBe(0);
  });

  it('keeps undated milestones among themselves in sort order', () => {
    expect(
      compareMilestonesForList(
        { date: null, id: 'a', sortOrder: 3 },
        { date: undefined, id: 'b', sortOrder: 1 },
      ),
    ).toBeGreaterThan(0);
  });
});

describe('sortMilestonesForList', () => {
  it('returns a sorted copy without mutating the input', () => {
    const input = [
      { date: null, id: 'undated', sortOrder: 0 },
      { date: '2026-09-01', id: 'late', sortOrder: 1 },
      { date: '2026-03-01', id: 'early', sortOrder: 2 },
    ];
    const sorted = sortMilestonesForList(input);

    expect(sorted.map((m) => m.id)).toEqual(['early', 'late', 'undated']);
    // Input untouched — the caller's array may be a store snapshot.
    expect(input.map((m) => m.id)).toEqual(['undated', 'late', 'early']);
  });
});

describe('milestoneProgressView', () => {
  it('passes null through as unavailable rather than faking a number', () => {
    expect(milestoneProgressView(null)).toBeNull();
    expect(milestoneProgressView(undefined)).toBeNull();
  });

  it('derives the percent from the completed/issues fraction', () => {
    expect(milestoneProgressView({ completed: 3, issues: 5, percent: 60 })).toEqual({
      completed: 3,
      issues: 5,
      percent: 60,
    });
    // A carried percent that disagrees with the fraction is corrected, so the
    // bar, the percentage and the fraction read the same truth.
    expect(milestoneProgressView({ completed: 1, issues: 3, percent: 99 })?.percent).toBe(33);
  });

  it('reads an empty denominator as an honest zero', () => {
    expect(milestoneProgressView({ completed: 0, issues: 0, percent: 0 })).toEqual({
      completed: 0,
      issues: 0,
      percent: 0,
    });
  });

  it('caps the bar at 100% when a stale count reports more done than scoped', () => {
    expect(milestoneProgressView({ completed: 7, issues: 5, percent: 140 })?.percent).toBe(100);
  });
});
