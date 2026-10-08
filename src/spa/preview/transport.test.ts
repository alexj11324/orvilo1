import { beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_STORAGE_KEY } from './fixtures';
import { createPreviewBackend, PreviewUnsupportedError } from './transport';

describe('isolated repository preview data', () => {
  beforeEach(() => localStorage.clear());
  it('loads the real workspace and list response shapes', () => {
    const backend = createPreviewBackend();
    expect(backend.execute('workspace.list')).toHaveLength(1);
    expect(backend.execute('task.list')).toMatchObject({ success: true, total: 9 });
    expect(backend.execute('providerBinding.list')).toEqual({ success: true, data: [] });
  });
  it('persists issue edits and preserves dates across reloads', () => {
    const backend = createPreviewBackend(localStorage);
    const issue = backend.getDatabase().tasks[0];
    backend.execute(
      'task.update',
      { id: issue.id, name: 'Updated locally', expectedDomainRevision: 1 },
      true,
    );
    const restored = createPreviewBackend(localStorage).getDatabase().tasks[0];
    expect(restored.name).toBe('Updated locally');
    expect(restored.domainRevision).toBe(2);
    expect(restored.updatedAt).toBeInstanceOf(Date);
  });
  it('rejects stale edits rather than overwriting a newer revision', () => {
    const backend = createPreviewBackend();
    expect(() =>
      backend.execute('task.update', { id: 'preview-task-1', expectedDomainRevision: 0 }, true),
    ).toThrow('Refresh');
  });
  it('creates distinct local issue identifiers', () => {
    const backend = createPreviewBackend();
    backend.execute('task.create', { name: 'First' }, true);
    backend.execute('task.create', { name: 'Second' }, true);
    expect(new Set(backend.getDatabase().tasks.map((t) => t.identifier)).size).toBe(11);
  });
  it('fails closed for execution and unimplemented mutations', () => {
    const backend = createPreviewBackend();
    expect(() => backend.execute('task.run', {}, true)).toThrow(PreviewUnsupportedError);
    expect(() => backend.execute('device.delete', {}, true)).toThrow(PreviewUnsupportedError);
  });
  it('recovers malformed fixtures and resets only its own storage key', () => {
    localStorage.setItem(PREVIEW_STORAGE_KEY, 'broken');
    localStorage.setItem('unrelated', 'keep');
    const backend = createPreviewBackend(localStorage);
    expect(backend.getDatabase().tasks).toHaveLength(9);
    backend.reset();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
