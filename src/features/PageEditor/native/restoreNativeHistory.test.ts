import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { describe, expect, it, vi } from 'vitest';

import { restoreNativeHistory } from './restoreNativeHistory';

describe('native history restore orchestration', () => {
  it('persists and reloads the actual restored rich document', async () => {
    const source = createHeadlessEditor();
    const active = createHeadlessEditor();
    const reload = createHeadlessEditor();
    try {
      source.hydrateMarkdown('## Historical title\n\n**Restored bold** and `code`');
      active.hydrateMarkdown('Current text');
      const snapshot = source.export().editorData;
      let persisted: ReturnType<typeof active.export>['editorData'] | undefined;
      await restoreNativeHistory({
        assertOwner: () => {},
        beforeRestore: async () => {},
        load: async () => ({ editorData: snapshot }),
        apply: (value) => active.kernel.setDocument('json', JSON.stringify(value)),
        save: async () => {
          persisted = active.export().editorData;
        },
      });
      expect(persisted).toBeDefined();
      if (!persisted) throw new Error('Restore was not persisted');
      reload.hydrateEditorData(persisted);
      expect(reload.export().markdown).toContain('## Historical title');
      expect(reload.export().markdown).toContain('**Restored bold**');
      expect(reload.export().markdown).toContain('`code`');
      expect(reload.export().markdown).not.toContain('Current text');
    } finally {
      source.destroy();
      active.destroy();
      reload.destroy();
    }
  });

  it('does not apply or save a snapshot after document ownership changes during fetch', async () => {
    let owned = true;
    const apply = vi.fn();
    const save = vi.fn(async () => {});
    await expect(
      restoreNativeHistory({
        assertOwner: () => {
          if (!owned) throw new Error('stale document');
        },
        beforeRestore: async () => {},
        load: async () => {
          owned = false;
          return { editorData: {} };
        },
        apply,
        save,
      }),
    ).rejects.toThrow('stale document');
    expect(apply).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not apply or save when lease/permission changes while metadata flushes', async () => {
    let owned = true;
    const apply = vi.fn();
    const save = vi.fn(async () => {});
    await expect(
      restoreNativeHistory({
        assertOwner: () => {
          if (!owned) throw new Error('lease lost');
        },
        beforeRestore: async () => {
          owned = false;
        },
        load: async () => ({ editorData: {} }),
        apply,
        save,
      }),
    ).rejects.toThrow('lease lost');
    expect(apply).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('propagates persistence failure instead of reporting restore success', async () => {
    await expect(
      restoreNativeHistory({
        assertOwner: () => {},
        beforeRestore: async () => {},
        load: async () => ({ editorData: {} }),
        apply: () => {},
        save: async () => {
          throw new Error('transport failed');
        },
      }),
    ).rejects.toThrow('transport failed');
  });
});
