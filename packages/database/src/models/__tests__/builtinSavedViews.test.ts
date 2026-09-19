import { builtinSavedViewId, isBuiltinSavedViewId } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { listVirtualBuiltinSavedViews } from '../builtinSavedViews';

describe('virtual builtin saved views', () => {
  it('does not persist rows and keeps ids stable', () => {
    const views = listVirtualBuiltinSavedViews('ws_1');
    expect(views.map((view) => view.id)).toEqual([
      builtinSavedViewId('all'),
      builtinSavedViewId('blocked'),
      builtinSavedViewId('in-progress'),
      builtinSavedViewId('projects'),
      builtinSavedViewId('review'),
    ]);
    expect(views.every((view) => isBuiltinSavedViewId(view.id))).toBe(true);
    expect(views.every((view) => view.ownerUserId === 'system')).toBe(true);
    expect(views.find((view) => view.id === 'builtin:review')?.queryAst.filter).toEqual({
      all: [{ field: 'reviewerUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });
  });
});
