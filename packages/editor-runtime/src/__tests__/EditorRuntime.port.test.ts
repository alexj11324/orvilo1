import { CommonPlugin, Kernel, ListPlugin, LitexmlPlugin, MarkdownPlugin } from '@lobehub/editor';
import { createHeadlessEditor } from '@lobehub/editor/headless';
import { describe, expect, it, vi } from 'vitest';

import type { EditorRuntimePort } from '../EditorRuntime';
import { LegacyEditorRuntime as EditorRuntime } from '../legacy';

const fixtures = [
  {
    name: 'public SDK Kernel',
    create: () => {
      const editor = new Kernel();
      editor.registerPlugins([CommonPlugin, MarkdownPlugin, ListPlugin, LitexmlPlugin]);
      editor.initNodeEditor();
      editor.setDocument('markdown', 'Original paragraph');
      return { editor, dispose: () => editor.destroy() };
    },
  },
  {
    name: 'real SDK headless Kernel',
    create: () => {
      const headless = createHeadlessEditor();
      headless.hydrateMarkdown('Original paragraph');
      return { editor: headless.kernel, dispose: () => headless.destroy() };
    },
  },
];
const documentText = (editor: EditorRuntimePort, format: string): string => {
  const value = editor.getDocument(format);
  if (typeof value !== 'string') throw new TypeError(`Expected actual ${format} document`);
  return value;
};

describe('owned EditorRuntimePort real SDK integration', () => {
  it.each(fixtures)(
    'mutates and persists confirmed results through $name without a cast',
    async ({ create }) => {
      const fixture = create();
      try {
        // Both concrete SDK owners must be assignable, not merely accepted after
        // erasure by Vitest. The sibling contract is checked separately by CI.
        const editor: EditorRuntimePort = fixture.editor;
        const runtime = new EditorRuntime();
        runtime.setEditor(editor);
        const after = vi.fn();
        runtime.setAfterMutateHandler(after);
        const replaced = await runtime.replaceText({ searchText: 'Original', newText: 'Replaced' });
        expect(replaced.replacementCount).toBe(1);
        expect(documentText(editor, 'markdown')).toContain('Replaced paragraph');
        const id = documentText(editor, 'litexml').match(/<p id="([^"]+)"/u)?.[1];
        if (!id) throw new Error('Fixture requires an actual stable paragraph ID');
        const modified = await runtime.modifyNodes({
          operations: [
            { action: 'remove', id: 'missing-paragraph' },
            { action: 'modify', litexml: `<p id="${id}">Confirmed paragraph</p>` },
          ],
        });
        expect(modified.results.map((result) => result.success)).toEqual([false, true]);
        expect(modified.successCount).toBe(1);
        expect(documentText(editor, 'markdown')).toContain('Confirmed paragraph');
        expect(after).toHaveBeenCalledTimes(2);
      } finally {
        fixture.dispose();
      }
    },
  );
});
