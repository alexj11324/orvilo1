import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

import { unlinkNativeNode } from './unlinkNativeNode';

describe('native block embed unlink', () => {
  it('retains the real iframe text as a valid root paragraph', () => {
    const backend = createHeadlessEditor();
    try {
      backend.kernel.setDocument(
        'litexml',
        '<root><link-iframe href="https://example.com" title="Example" /></root>',
      );
      const editor = backend.kernel.getLexicalEditor();
      if (!editor) throw new Error('Real editor required');
      editor.update(
        () => {
          const node = $getRoot().getFirstChildOrThrow();
          expect(node.getType()).toBe('link-iframe');
          unlinkNativeNode(node);
        },
        { discrete: true },
      );
      editor.getEditorState().read(() => {
        const node = $getRoot().getFirstChildOrThrow();
        expect(node.getType()).toBe('paragraph');
        expect(node.getTextContent()).toContain('Example');
      });
    } finally {
      backend.destroy();
    }
  });
});
