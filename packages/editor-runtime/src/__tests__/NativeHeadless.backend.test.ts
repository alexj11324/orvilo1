import { describe, expect, it, vi } from 'vitest';

import { EditorRuntime } from '../EditorRuntime';
import {
  createHeadlessEditor,
  DiffAction,
  LITEXML_DIFFNODE_ALL_COMMAND,
  nativeEditorRuntimeCommands,
} from '../native-headless';

describe('owned current headless backend', () => {
  it('reports actual mixed-operation outcomes through its own command identities', async () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('Original text');
      const id = editor.export({ litexml: true }).litexml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture must expose its real node ID');
      const runtime = new EditorRuntime();
      runtime.setEditor(editor.kernel, nativeEditorRuntimeCommands);
      const after = vi.fn();
      runtime.setAfterMutateHandler(after);
      const result = await runtime.modifyNodes({
        operations: [
          { action: 'remove', id: 'missing-node' },
          { action: 'modify', litexml: `<p id="${id}">Updated local content</p>` },
        ],
      });
      expect(result.results.map((item) => item.success)).toEqual([false, true]);
      expect(editor.export().markdown).toContain('Updated local content');
      expect(after).toHaveBeenCalledTimes(1);
      editor.kernel.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, { action: DiffAction.Accept });
      expect(editor.export().markdown).toContain('Updated local content');
    } finally {
      editor.destroy();
    }
  });
  it('round-trips persisted stable IDs and CJK/math through the local codecs', () => {
    const first = createHeadlessEditor();
    const second = createHeadlessEditor();
    try {
      first.hydrateMarkdown('中文 **加粗**\n\n$E=mc^2$');
      const snapshot = first.export({ litexml: true });
      second.hydrateEditorData(snapshot.editorData, { keepId: true });
      const restored = second.export({ litexml: true });
      expect(restored.editorData).toEqual(snapshot.editorData);
      expect(restored.markdown).toBe(snapshot.markdown);
      expect(restored.litexml).toBe(snapshot.litexml);
    } finally {
      first.destroy();
      second.destroy();
    }
  });
});
