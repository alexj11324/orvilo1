import { describe, expect, it, vi } from 'vitest';

import {
  dependentIdentifier,
  isMultiSelectRelation,
  type RelationCandidate,
  relationPickerRows,
  relationRejectionCode,
  relationRejectionKey,
  relationSearchEligibility,
  toggleRelationCandidate,
  writeRelationsOneByOne,
} from './issueRelationPicker';

const issue = (id: string, extra: Partial<RelationCandidate> = {}): RelationCandidate => ({
  id,
  identifier: id.toUpperCase(),
  title: `Issue ${id}`,
  ...extra,
});

/** The shape a tRPC client error has after the server's error formatter. */
const rejected = (code: string, message = 'server prose') => ({
  data: { code: 'BAD_REQUEST', errorData: { code } },
  message,
});

describe('isMultiSelectRelation', () => {
  it('collects several issues for every link an issue can have many of', () => {
    expect(
      (['parentOf', 'blockedBy', 'blocking', 'relatedTo'] as const).map(isMultiSelectRelation),
    ).toEqual([true, true, true, true]);
  });

  it('keeps the single-valued links — one parent, one duplicate target — single', () => {
    expect(isMultiSelectRelation('subIssueOf')).toBe(false);
    expect(isMultiSelectRelation('duplicateOf')).toBe(false);
  });
});

describe('relationSearchEligibility', () => {
  it('asks the server for only the issues that can take each link', () => {
    expect(relationSearchEligibility('parentOf')).toBe('child');
    expect(relationSearchEligibility('subIssueOf')).toBe('parent');
    expect(relationSearchEligibility('blockedBy')).toBe('dependency');
    expect(relationSearchEligibility('blocking')).toBe('dependency');
    expect(relationSearchEligibility('relatedTo')).toBe('dependency');
  });

  it('leaves duplicate targets unscoped — the server has no project rule for them', () => {
    expect(relationSearchEligibility('duplicateOf')).toBeUndefined();
  });
});

describe('selection', () => {
  it('adds an unpicked issue and removes a picked one', () => {
    const one = toggleRelationCandidate([], issue('a'));
    const two = toggleRelationCandidate(one, issue('b'));
    expect(two.map((item) => item.id)).toEqual(['a', 'b']);
    expect(toggleRelationCandidate(two, issue('a')).map((item) => item.id)).toEqual(['b']);
  });

  it('keeps picked issues listed when a new search no longer returns them', () => {
    const rows = relationPickerRows([issue('a'), issue('b')], [issue('b'), issue('c')]);
    expect(rows.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('relationRejectionKey', () => {
  it('names the specific reason from the stable code, never from the message', () => {
    // The message deliberately says something else: only the code may decide.
    expect(relationRejectionKey(rejected('CROSS_PROJECT', 'cycle'), 'dependency')).toBe(
      'taskDetail.relationError.crossProject',
    );
    expect(relationRejectionKey(rejected('UNFINISHED_PREREQUISITE'), 'dependency')).toBe(
      'taskDetail.relationError.unfinishedPrerequisite',
    );
    expect(relationRejectionKey(rejected('ALREADY_BLOCKING'), 'dependency')).toBe(
      'taskDetail.relationError.alreadyBlocking',
    );
    expect(relationRejectionKey(rejected('SELF'), 'parent')).toBe('taskDetail.relationError.self');
    expect(relationRejectionKey(rejected('UNAVAILABLE'), 'dependency')).toBe(
      'taskDetail.relationError.unavailable',
    );
  });

  it('tells a parent with an unusable chain apart from a cycle', () => {
    expect(relationRejectionKey(rejected('BROKEN_PARENT_CHAIN'), 'parent')).toBe(
      'taskDetail.relationError.brokenParentChain',
    );
  });

  it('names a link between two workspaces as its own reason', () => {
    expect(relationRejectionKey(rejected('CROSS_SCOPE'), 'parent')).toBe(
      'taskDetail.relationError.crossScope',
    );
  });

  it('words a cycle for the link that was attempted', () => {
    expect(relationRejectionKey(rejected('CYCLE'), 'dependency')).toBe(
      'taskDetail.relationError.dependencyCycle',
    );
    expect(relationRejectionKey(rejected('CYCLE'), 'parent')).toBe(
      'taskDetail.relationError.parentCycle',
    );
  });

  it('returns nothing for a failure without a known code', () => {
    expect(
      relationRejectionCode(new Error('This dependency would create a cycle.')),
    ).toBeUndefined();
    expect(relationRejectionKey(new Error('cannot cross project boundaries'), 'dependency')).toBe(
      undefined,
    );
    expect(relationRejectionKey(rejected('SomethingNew'), 'parent')).toBeUndefined();
    expect(relationRejectionKey(undefined, 'parent')).toBeUndefined();
  });
});

describe('writeRelationsOneByOne', () => {
  it('attempts every issue and reports what landed and what was refused', async () => {
    const refusal = rejected('CYCLE');
    const write = vi.fn(async (candidate: RelationCandidate) => {
      if (candidate.id === 'b') throw refusal;
    });

    const result = await writeRelationsOneByOne([issue('a'), issue('b'), issue('c')], write);

    expect(write).toHaveBeenCalledTimes(3);
    expect(result.added.map((item) => item.id)).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ candidate: issue('b'), error: refusal }]);
  });

  it('writes in order, one at a time', async () => {
    const order: string[] = [];
    await writeRelationsOneByOne([issue('a'), issue('b')], async (candidate) => {
      order.push(`start:${candidate.id}`);
      await Promise.resolve();
      order.push(`end:${candidate.id}`);
    });
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });
});

describe('dependentIdentifier', () => {
  it('names the issue that would have gained the prerequisite', () => {
    expect(dependentIdentifier(false, 'ORV-1', 'ORV-2')).toBe('ORV-1');
    expect(dependentIdentifier(true, 'ORV-1', 'ORV-2')).toBe('ORV-2');
  });
});
