import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { $getRoot, $isTextNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import {
  applyNativeSlashChoice,
  matchNativeSlash,
  type NativeSlashChoice,
  readNativeSlash,
} from './slashActions';

function setup(text: string) {
  const owner = createHeadlessEditor();
  owner.hydrateMarkdown(text);
  const editor = owner.kernel.getLexicalEditor();
  if (!editor) throw new Error('Actual registered kernel unavailable');
  editor.setEditable(true);
  editor.update(
    () => {
      const textNode = $getRoot().getFirstDescendant();
      if (!$isTextNode(textNode)) throw new Error('Slash fixture must be actual simple text');
      textNode.selectEnd();
    },
    { discrete: true },
  );
  const match = editor.getEditorState().read(readNativeSlash);
  if (!match) throw new Error('Actual slash selection not captured');
  return { owner, editor, match };
}

describe('native page slash matching and actual commands', () => {
  it('keeps original simple-word boundaries and limits', () => {
    expect(matchNativeSlash('before /h1 after', 10)).toMatchObject({
      start: 7,
      end: 10,
      query: 'h1',
    });
    expect(matchNativeSlash('https://example', 15)).toBeUndefined();
    expect(matchNativeSlash('/' + 'x'.repeat(76), 77)).toBeUndefined();
    expect(matchNativeSlash('/标题', 3)?.query).toBe('标题');
  });

  it.each<[NativeSlashChoice, string]>([
    ['h1', 'heading'],
    ['h2', 'heading'],
    ['h3', 'heading'],
    ['tl', 'list'],
    ['ul', 'list'],
    ['ol', 'list'],
    ['hr', 'horizontalrule'],
    ['table', 'table'],
    ['codeblock', 'code'],
    ['tex', 'math'],
  ])('dispatches registered %s and serializes its actual %s node', (choice, expected) => {
    const { owner, editor, match } = setup('/' + choice);
    try {
      expect(applyNativeSlashChoice(editor, match, choice)).toBe(true);
      const json = JSON.stringify(owner.export().editorData);
      expect(json).toContain(`"type":"${expected}"`);
      expect(json).not.toContain('/' + choice);
      if (choice === 'table') {
        const rows = owner.export().editorData.root.children.find((node) => node.type === 'table');
        expect(JSON.stringify(rows ?? null).match(/"type":"tablerow"/g)).toHaveLength(3);
        expect(JSON.stringify(rows ?? null).match(/"type":"tablecell"/g)).toHaveLength(9);
      }
    } finally {
      owner.destroy();
    }
  });

  it('preserves query and current content when permission or selection changed', () => {
    const { owner, editor, match } = setup('/h1');
    try {
      const before = JSON.stringify(owner.export().editorData);
      editor.setEditable(false);
      expect(applyNativeSlashChoice(editor, match, 'h1')).toBe(false);
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
      editor.setEditable(true);
      editor.update(
        () => {
          const node = $getRoot().getFirstDescendant();
          if ($isTextNode(node)) node.select(0, 0);
        },
        { discrete: true },
      );
      expect(applyNativeSlashChoice(editor, match, 'h1')).toBe(false);
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
    } finally {
      owner.destroy();
    }
  });

  it('does not consume image query on cancel or invalid file', () => {
    const { owner, editor, match } = setup('/image');
    try {
      const before = JSON.stringify(owner.export().editorData);
      expect(applyNativeSlashChoice(editor, match, 'image')).toBe(false);
      expect(
        applyNativeSlashChoice(
          editor,
          match,
          'image',
          new File(['text'], 'bad.txt', { type: 'text/plain' }),
        ),
      ).toBe(false);
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
    } finally {
      owner.destroy();
    }
  });
});
