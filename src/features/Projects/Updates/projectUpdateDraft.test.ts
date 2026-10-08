import { beforeEach, describe, expect, it } from 'vitest';

import { CHAT_INPUT_DRAFTS_STORAGE_KEY } from '@/features/ChatInput/draftStorage';

import {
  clearProjectUpdateDraft,
  persistProjectUpdateDraft,
  projectUpdateDraftKey,
  readProjectUpdateDraft,
  resolveProjectUpdateDraft,
} from './projectUpdateDraft';

const scope = { projectId: 'p1', userId: 'u1', workspaceId: 'w1' };
const key = projectUpdateDraftKey(scope);

beforeEach(() => {
  window.localStorage.clear();
});

describe('projectUpdateDraftKey', () => {
  it('scopes the key by user, workspace, project and edited row', () => {
    const keys = [
      key,
      projectUpdateDraftKey({ ...scope, userId: 'u2' }),
      projectUpdateDraftKey({ ...scope, workspaceId: 'w2' }),
      projectUpdateDraftKey({ ...scope, workspaceId: null }),
      projectUpdateDraftKey({ ...scope, projectId: 'p2' }),
      projectUpdateDraftKey({ ...scope, updateId: 'upd1' }),
    ];

    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps personal mode apart from a workspace named like it', () => {
    expect(projectUpdateDraftKey({ ...scope, workspaceId: null })).not.toBe(
      projectUpdateDraftKey({ ...scope, workspaceId: 'personal' }),
    );
  });

  it('has no key without a signed-in user', () => {
    expect(projectUpdateDraftKey({ ...scope, userId: undefined })).toBeUndefined();
    expect(projectUpdateDraftKey({ ...scope, userId: null })).toBeUndefined();
    expect(projectUpdateDraftKey({ ...scope, userId: '' })).toBeUndefined();
  });
});

describe('draft isolation', () => {
  const draft = { body: 'wip', health: 'atRisk', mode: 'update' } as const;

  it('does not restore one user’s draft for another account or workspace', () => {
    persistProjectUpdateDraft(key, draft);

    expect(readProjectUpdateDraft(key)).toEqual(draft);
    expect(
      readProjectUpdateDraft(projectUpdateDraftKey({ ...scope, userId: 'u2' })),
    ).toBeUndefined();
    expect(
      readProjectUpdateDraft(projectUpdateDraftKey({ ...scope, workspaceId: 'w2' })),
    ).toBeUndefined();
  });

  it('neither writes nor reads once signed out', () => {
    persistProjectUpdateDraft(key, draft);
    const signedOut = projectUpdateDraftKey({ ...scope, userId: undefined });
    const before = window.localStorage.getItem(CHAT_INPUT_DRAFTS_STORAGE_KEY);

    persistProjectUpdateDraft(signedOut, { ...draft, body: 'other' });

    expect(window.localStorage.getItem(CHAT_INPUT_DRAFTS_STORAGE_KEY)).toBe(before);
    expect(readProjectUpdateDraft(signedOut)).toBeUndefined();
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
  it('stores a new draft that survives a reload', () => {
    persistProjectUpdateDraft(key, { body: 'wip', health: 'atRisk', mode: 'update' });

    expect(resolveProjectUpdateDraft(readProjectUpdateDraft(key), undefined, 'comment')).toEqual({
      body: 'wip',
      health: 'atRisk',
      mode: 'update',
    });
  });

  it('removes the draft once the body is blank', () => {
    persistProjectUpdateDraft(key, { body: 'wip', health: 'onTrack', mode: 'update' });
    persistProjectUpdateDraft(key, { body: '  \n', health: 'onTrack', mode: 'update' });

    expect(readProjectUpdateDraft(key)).toBeUndefined();
  });

  describe('editing a posted row', () => {
    const editKey = projectUpdateDraftKey({ ...scope, updateId: 'upd1' });
    const saved = { body: 'posted', health: 'atRisk', kind: 'update' } as const;

    it('does not persist content that matches the saved record', () => {
      persistProjectUpdateDraft(
        editKey,
        { body: 'posted', health: 'atRisk', mode: 'update' },
        saved,
      );
      expect(readProjectUpdateDraft(editKey)).toBeUndefined();

      // The editor may re-serialize the same markdown with different outer whitespace.
      persistProjectUpdateDraft(
        editKey,
        { body: 'posted\n', health: 'atRisk', mode: 'update' },
        saved,
      );
      expect(readProjectUpdateDraft(editKey)).toBeUndefined();
    });

    it('does not persist an untouched comment, which has no health', () => {
      persistProjectUpdateDraft(
        editKey,
        { body: 'note', health: 'onTrack', mode: 'comment' },
        { body: 'note', kind: 'comment' },
      );

      expect(readProjectUpdateDraft(editKey)).toBeUndefined();
    });

    it('persists a changed body or health', () => {
      persistProjectUpdateDraft(
        editKey,
        { body: 'edited', health: 'atRisk', mode: 'update' },
        saved,
      );
      expect(readProjectUpdateDraft(editKey)?.body).toBe('edited');

      clearProjectUpdateDraft(editKey);
      persistProjectUpdateDraft(
        editKey,
        { body: 'posted', health: 'offTrack', mode: 'update' },
        saved,
      );
      expect(readProjectUpdateDraft(editKey)?.health).toBe('offTrack');
    });

    it('drops the draft when the edit returns to the saved content', () => {
      persistProjectUpdateDraft(
        editKey,
        { body: 'edited', health: 'atRisk', mode: 'update' },
        saved,
      );
      persistProjectUpdateDraft(
        editKey,
        { body: 'posted', health: 'atRisk', mode: 'update' },
        saved,
      );

      expect(readProjectUpdateDraft(editKey)).toBeUndefined();
    });

    it('clears the draft on cancel without touching other drafts', () => {
      persistProjectUpdateDraft(
        editKey,
        { body: 'edited', health: 'atRisk', mode: 'update' },
        saved,
      );
      persistProjectUpdateDraft(key, { body: 'wip', health: 'onTrack', mode: 'update' });

      clearProjectUpdateDraft(editKey);

      expect(readProjectUpdateDraft(editKey)).toBeUndefined();
      expect(readProjectUpdateDraft(key)?.body).toBe('wip');
    });
  });
});
