import { describe, expect, it } from 'vitest';

import {
  collapseRelationRows,
  isOpenBlocker,
  ISSUE_RELATION_KINDS,
  relationKindOf,
} from './relationGroups';

describe('relationKindOf', () => {
  it('keeps an unmarked blocks edge as blocked-by', () => {
    expect(relationKindOf({ type: 'blocks' })).toBe('blockedBy');
    expect(relationKindOf({ direction: 'blockedBy', type: 'blocks' })).toBe('blockedBy');
  });

  it('splits the reverse blocks edge into blocking', () => {
    expect(relationKindOf({ direction: 'blocking', type: 'blocks' })).toBe('blocking');
  });

  it('treats relates as its own group', () => {
    expect(relationKindOf({ type: 'relates' })).toBe('relates');
    expect(relationKindOf({ type: 'duplicate' })).toBeNull();
  });
});

describe('isOpenBlocker', () => {
  it('ignores issues this one blocks', () => {
    expect(isOpenBlocker({ direction: 'blocking', status: 'backlog', type: 'blocks' })).toBe(false);
  });

  it('treats a missing status as still blocking the run', () => {
    expect(isOpenBlocker({ status: null, type: 'blocks' })).toBe(true);
    expect(isOpenBlocker({ status: 'completed', type: 'blocks' })).toBe(false);
  });
});

const rows = (...identifiers: string[]) => identifiers.map((id) => ({ dependsOn: id }));
const groupedOf = (blockedBy: string[], blocking: string[], relates: string[]) => ({
  blockedBy: rows(...blockedBy),
  blocking: rows(...blocking),
  relates: rows(...relates),
});

describe('collapseRelationRows', () => {
  it('pins the kind order Linear uses: blockedBy, then blocking, then relates', () => {
    expect(ISSUE_RELATION_KINDS).toEqual(['blockedBy', 'blocking', 'relates']);
  });

  it('shows every row under the limit and hides nothing', () => {
    const { hiddenCount, visible } = collapseRelationRows(
      groupedOf(['T-1', 'T-2'], ['T-3'], []),
      false,
    );
    expect(hiddenCount).toBe(0);
    expect(visible.blockedBy).toHaveLength(2);
    expect(visible.blocking).toHaveLength(1);
    expect(visible.relates).toHaveLength(0);
  });

  it('caps the fold at five rows in kind order, counting the rest', () => {
    const { hiddenCount, visible } = collapseRelationRows(
      groupedOf(['T-1', 'T-2', 'T-3'], ['T-4', 'T-5', 'T-6', 'T-7'], ['T-8', 'T-9']),
      false,
    );
    // 3 blockedBy + 2 blocking fit the budget; the rest fold away.
    expect(visible.blockedBy.map((edge) => edge.dependsOn)).toEqual(['T-1', 'T-2', 'T-3']);
    expect(visible.blocking.map((edge) => edge.dependsOn)).toEqual(['T-4', 'T-5']);
    expect(visible.relates).toEqual([]);
    expect(hiddenCount).toBe(4);
  });

  it('lets a later kind spend the whole remaining budget of an earlier one', () => {
    const { hiddenCount, visible } = collapseRelationRows(
      groupedOf([], ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6'], []),
      false,
    );
    expect(visible.blocking).toHaveLength(5);
    expect(hiddenCount).toBe(1);
  });

  it('reveals every row once expanded', () => {
    const { hiddenCount, visible } = collapseRelationRows(
      groupedOf(['T-1', 'T-2', 'T-3'], ['T-4', 'T-5', 'T-6', 'T-7'], ['T-8', 'T-9']),
      true,
    );
    expect(visible.blocking).toHaveLength(4);
    expect(visible.relates).toHaveLength(2);
    expect(hiddenCount).toBe(0);
  });
});
