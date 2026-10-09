import { describe, expect, it } from 'vitest';

import { commentAnchorId, getCommentActions, isCommentAnchorHash } from './commentActions';

const writer = { canWrite: true };
const mine = { author: { id: 'user-1', type: 'user' as const } };

describe('getCommentActions', () => {
  it('offers edit and delete to the author', () => {
    expect(getCommentActions(mine, 'user-1', writer)).toEqual({
      canCopyLink: true,
      canDelete: true,
      canEdit: true,
    });
  });

  it("hides edit and delete on another member's comment but keeps copy link", () => {
    expect(getCommentActions(mine, 'user-2', writer)).toEqual({
      canCopyLink: true,
      canDelete: false,
      canEdit: false,
    });
  });

  it('does not treat an agent whose id equals the viewer id as the author', () => {
    const agent = { author: { id: 'user-1', type: 'agent' as const } };
    expect(getCommentActions(agent, 'user-1', writer).canEdit).toBe(false);
  });

  it('offers nothing to manage when the author or viewer is unknown', () => {
    expect(getCommentActions({ author: undefined }, 'user-1', writer).canEdit).toBe(false);
    expect(getCommentActions(mine, undefined, writer).canDelete).toBe(false);
  });

  it('keeps read-only viewers from editing their own comment', () => {
    expect(getCommentActions(mine, 'user-1', { canWrite: false }).canEdit).toBe(false);
  });
});

describe('comment anchors', () => {
  it('matches only the exact fragment', () => {
    expect(commentAnchorId('c1')).toBe('comment-c1');
    expect(isCommentAnchorHash('#comment-c1', 'c1')).toBe(true);
    expect(isCommentAnchorHash('#comment-c10', 'c1')).toBe(false);
    expect(isCommentAnchorHash('', 'c1')).toBe(false);
  });
});
