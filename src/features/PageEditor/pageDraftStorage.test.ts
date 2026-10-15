import { afterEach, describe, expect, it, vi } from 'vitest';

import { readPageDraft, writeDraft } from './pageDraftStorage';

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});
describe('shared page recovery draft storage', () => {
  it('keeps the legacy page-draft key and round trips native document JSON', () => {
    const draft = {
      documentId: 'doc',
      editorData: { root: { children: [] } },
      ownerId: 'lease',
      savedAt: new Date().toISOString(),
    };
    writeDraft(draft);
    expect(window.sessionStorage.getItem('page-draft:doc')).toBe(JSON.stringify(draft));
    expect(readPageDraft('doc')).toEqual(draft);
    expect(readPageDraft('other')).toBeNull();
  });
  it('does not restore an expired, cross-document or malformed draft', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    writeDraft({ documentId: 'doc', editorData: {}, savedAt: '2026-10-13T12:00:00Z' });
    expect(readPageDraft('doc')).toBeNull();
    expect(window.sessionStorage.getItem('page-draft:doc')).toBeNull();
    window.sessionStorage.setItem(
      'page-draft:doc',
      '{"documentId":"other","savedAt":"2026-10-15T12:00:00Z"}',
    );
    expect(readPageDraft('doc')).toBeNull();
    window.sessionStorage.setItem('page-draft:doc', '{');
    expect(readPageDraft('doc')).toBeNull();
  });
});
