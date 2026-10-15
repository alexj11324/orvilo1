import { describe, expect, it, vi } from 'vitest';

import { EditorRuntime } from '../EditorRuntime';
import { createHeadlessEditor } from '../native-headless';
import { ILitexmlService, IMarkdownShortCutService } from '../native-headless/browser';

// Importing the owned runtime must never evaluate either legacy SDK entry.
vi.mock('@lobehub/editor', () => {
  throw new Error('Owned graph loaded SDK UI');
});
vi.mock('@lobehub/editor/litexml-commands', () => {
  throw new Error('Owned graph loaded SDK commands');
});

// Actual registered native codec/listener effects, not a boolean dispatch mock.
describe('owned runtime SDK-free default boundary', () => {
  it('replaces and modifies the actual owned document with default native identities', async () => {
    const headless = createHeadlessEditor();
    try {
      headless.hydrateMarkdown('Original paragraph');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const replacement = await runtime.replaceText({ searchText: 'Original', newText: 'Updated' });
      expect(replacement.replacementCount).toBe(1);
      expect(headless.export().markdown).toContain('Updated paragraph');
      const id = headless.export({ litexml: true }).litexml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Actual owned paragraph ID missing');
      const result = await runtime.modifyNodes({
        operations: [
          { action: 'remove', id: 'missing-node' },
          { action: 'modify', litexml: `<p id="${id}">Native confirmed result</p>` },
        ],
      });
      expect(result.results.map((item) => item.success)).toEqual([false, true]);
      expect(headless.export().markdown).toContain('Native confirmed result');
    } finally {
      headless.destroy();
    }
  });

  it('uses actual owned XML and Markdown service registrations without SDK type aliases', () => {
    const headless = createHeadlessEditor();
    try {
      const xml = headless.kernel.requireService(ILitexmlService);
      const markdown = headless.kernel.requireService(IMarkdownShortCutService);
      if (!xml || !markdown) throw new Error('Actual owned codec services missing');
      xml.registerXMLReader('runtime-owned', (element) => ({
        type: 'text',
        version: 1,
        text: element.getAttribute('value') ?? '',
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
      }));
      headless.hydrateLiteXML('<p><runtime-owned value="Owned XML" /></p>');
      expect(headless.export().markdown).toContain('Owned XML');
      markdown.registerMarkdownReader(
        'inlineCode',
        (node) => {
          if (node.value !== 'runtime-owned') return false;
          return {
            type: 'text',
            version: 1,
            text: 'Owned Markdown',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
          };
        },
        0,
      );
      headless.hydrateMarkdown('Before `runtime-owned` after');
      expect(headless.export().markdown).toContain('Owned Markdown');
    } finally {
      headless.destroy();
    }
  });
});
