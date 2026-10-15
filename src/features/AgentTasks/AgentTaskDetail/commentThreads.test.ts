import { describe, expect, it } from 'vitest';

import { splitCommentThreads } from './commentThreads';

const comment = (id: string, parentCommentId?: string | null) => ({
  id,
  parentCommentId: parentCommentId ?? null,
  type: 'comment' as const,
});

describe('splitCommentThreads', () => {
  it('groups replies under their root and keeps the remaining rows at top level', () => {
    const items = [
      { id: 'a1', type: 'created' as const },
      comment('c1'),
      comment('c2', 'c1'),
      comment('c3', 'c1'),
      comment('c4'),
    ];

    const { repliesByParent, topLevel } = splitCommentThreads(items);

    expect(topLevel.map((i) => i.id)).toEqual(['a1', 'c1', 'c4']);
    expect(repliesByParent.get('c1')?.map((i) => i.id)).toEqual(['c2', 'c3']);
    expect(repliesByParent.has('c4')).toBe(false);
  });

  it('keeps a reply at the top level when its root is not in the list', () => {
    const { repliesByParent, topLevel } = splitCommentThreads([comment('orphan', 'cmt-gone')]);

    expect(topLevel.map((i) => i.id)).toEqual(['orphan']);
    expect(repliesByParent.size).toBe(0);
  });

  it('reattaches a reply-to-reply to the thread root instead of dropping it', () => {
    // One level of nesting renders — a reply aimed at a reply must land on
    // the root's bucket; grouping it under its direct parent hides it, since
    // nested cards never read their own replies bucket.
    const { repliesByParent, topLevel } = splitCommentThreads([
      comment('c1'),
      comment('c2', 'c1'),
      comment('c3', 'c2'),
    ]);

    expect(topLevel.map((i) => i.id)).toEqual(['c1']);
    expect(repliesByParent.get('c1')?.map((i) => i.id)).toEqual(['c2', 'c3']);
    expect(repliesByParent.has('c2')).toBe(false);
  });

  it('nests under the nearest remaining ancestor when the root left the list', () => {
    const { repliesByParent, topLevel } = splitCommentThreads([
      comment('c2', 'cmt-gone'),
      comment('c3', 'c2'),
    ]);

    expect(topLevel.map((i) => i.id)).toEqual(['c2']);
    expect(repliesByParent.get('c2')?.map((i) => i.id)).toEqual(['c3']);
  });

  it('ignores non-comment rows that carry a parentCommentId by accident', () => {
    const stray = { id: 't1', parentCommentId: 'c1', type: 'topic' as const };
    const { topLevel } = splitCommentThreads([comment('c1'), stray]);

    expect(topLevel.map((i) => i.id)).toEqual(['c1', 't1']);
  });
});
