import { beforeEach, describe, expect, it } from 'vitest';

import { getDraft } from '@/features/ChatInput/draftStorage';

import {
  persistProjectUpdateDraft,
  projectUpdateDraftKey,
  resolveProjectUpdateDraft,
} from './projectUpdateDraft';

describe('projectUpdateDraftKey', () => {
  it('separates users, projects and the row being edited', () => {
    expect(projectUpdateDraftKey('u1', 'p1')).toBe('project-update:u1:p1:new');
    expect(projectUpdateDraftKey('u1', 'p1', 'upd1')).toBe('project-update:u1:p1:upd1');
    expect(projectUpdateDraftKey(undefined, 'p1')).toBe('project-update:local:p1:new');
  });
});

describe('resolveProjectUpdateDraft', () => {
  it('falls back to defaults without a stored draft', () => {
    expect(resolveProjectUpdateDraft(undefined, undefined, 'comment')).toEqual({
      body: '',
      health: 'onTrack',
      mode: 'comment',
    });
  });

  it('restores a stored draft', () => {
    expect(
      resolveProjectUpdateDraft(
        { body: 'wip', health: 'atRisk', mode: 'comment' },
        undefined,
        'update',
      ),
    ).toEqual({ body: 'wip', health: 'atRisk', mode: 'comment' });
  });

  it('prefers the stored draft over the edited row but keeps its kind', () => {
    expect(
      resolveProjectUpdateDraft(
        { body: 'edited', health: 'offTrack', mode: 'comment' },
        { body: 'posted', health: 'onTrack', kind: 'update' },
        'comment',
      ),
    ).toEqual({ body: 'edited', health: 'offTrack', mode: 'update' });
  });

  it('ignores malformed stored fields', () => {
    expect(
      resolveProjectUpdateDraft(
        { body: 1, health: 'great', mode: 'note' },
        { body: 'posted', health: 'atRisk', kind: 'update' },
        'comment',
      ),
    ).toEqual({ body: 'posted', health: 'atRisk', mode: 'update' });
    expect(resolveProjectUpdateDraft({ mode: 'note' }, undefined, 'update').mode).toBe('update');
  });
});

describe('persistProjectUpdateDraft', () => {
  const key = projectUpdateDraftKey('u1', 'p1');

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores a draft that survives a reload', () => {
    persistProjectUpdateDraft(key, { body: 'wip', health: 'atRisk', mode: 'update' });

    expect(resolveProjectUpdateDraft(getDraft(key), undefined, 'comment')).toEqual({
      body: 'wip',
      health: 'atRisk',
      mode: 'update',
    });
  });

  it('removes the draft once the body is blank', () => {
    persistProjectUpdateDraft(key, { body: 'wip', health: 'onTrack', mode: 'update' });
    persistProjectUpdateDraft(key, { body: '  \n', health: 'onTrack', mode: 'update' });

    expect(getDraft(key)).toBeUndefined();
  });
});
