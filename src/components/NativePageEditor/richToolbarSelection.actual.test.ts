import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { INSERT_UNORDERED_LIST_COMMAND } from '@orvilo/editor-runtime/native-browser';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  $setSelection,
  FORMAT_TEXT_COMMAND,
} from 'lexical';
import { describe, expect, it } from 'vitest';

import { $captureNativeToolbarSelection, applyNativeToolbarAction } from './richToolbarSelection';

function setup() {
  const owner = createHeadlessEditor();
  owner.hydrateMarkdown('original rich text');
  const editor = owner.kernel.getLexicalEditor();
  if (!editor) throw new Error('Actual kernel did not initialize');
  editor.setEditable(true);
  editor.update(
    () => {
      const node = $getRoot().getFirstDescendant();
      if (!$isTextNode(node)) throw new Error('Actual text fixture missing');
      node.select(0, node.getTextContentSize());
    },
    { discrete: true },
  );
  const saved = editor.getEditorState().read($captureNativeToolbarSelection);
  if (!saved) throw new Error('Actual selection was not captured');
  return { owner, editor, saved };
}

describe('actual native toolbar stale range protection', () => {
  it('clears capture for actual null and node selections', () => {
    const { owner, editor, saved } = setup();
    try {
      editor.update(() => $setSelection(null), { discrete: true });
      expect(editor.getEditorState().read($captureNativeToolbarSelection)).toBeNull();
      editor.update(
        () => {
          const selected = $createNodeSelection();
          selected.add(saved.anchor.key);
          $setSelection(selected);
        },
        { discrete: true },
      );
      expect(editor.getEditorState().read($captureNativeToolbarSelection)).toBeNull();
    } finally {
      owner.destroy();
    }
  });

  it('does not restore deleted points after real cleanDocument before bold or list commands', () => {
    const { owner, editor, saved } = setup();
    try {
      owner.kernel.cleanDocument();
      editor.update(() => $setSelection(null), { discrete: true });
      const before = JSON.stringify(owner.export().editorData);
      expect(
        editor.getEditorState().read(() => $getNodeByKey(saved.anchor.key)?.isAttached() ?? false),
      ).toBe(false);
      expect(() => {
        expect(
          applyNativeToolbarAction(editor, saved, () =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
          ),
        ).toBe(false);
        expect(
          applyNativeToolbarAction(editor, saved, () =>
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
          ),
        ).toBe(false);
      }).not.toThrow();
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
      expect(editor.getEditorState().read($captureNativeToolbarSelection)).toBeNull();
    } finally {
      owner.destroy();
    }
  });

  it('rejects out of bounds saved text offsets even when the same node is still attached', () => {
    const { owner, editor, saved } = setup();
    try {
      editor.update(
        () => {
          const node = $getNodeByKey(saved.focus.key);
          if (!$isTextNode(node)) throw new Error('Captured text node disappeared');
          node.setTextContent('x');
          $setSelection(null);
        },
        { discrete: true },
      );
      expect(editor.getEditorState().read(() => $getNodeByKey(saved.focus.key)?.isAttached())).toBe(
        true,
      );
      const before = JSON.stringify(owner.export().editorData);
      expect(
        applyNativeToolbarAction(editor, saved, () =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
        ),
      ).toBe(false);
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
    } finally {
      owner.destroy();
    }
  });

  it('uses a real fresh selection after reset and preserves readonly guards', () => {
    const { owner, editor, saved } = setup();
    try {
      owner.hydrateMarkdown('fresh document');
      editor.update(
        () => {
          const node = $getRoot().getFirstDescendant();
          if (!$isTextNode(node)) throw new Error('Fresh document text missing');
          node.select(0, node.getTextContentSize());
        },
        { discrete: true },
      );
      expect(
        applyNativeToolbarAction(editor, saved, () =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
        ),
      ).toBe(true);
      expect(
        applyNativeToolbarAction(editor, saved, () =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
        ),
      ).toBe(true);
      const json = JSON.stringify(owner.export().editorData);
      expect(json).toContain('fresh document');
      expect(json).not.toContain('original rich text');
      expect(json).toContain('"listType":"bullet"');
      editor.getEditorState().read(() => {
        const node = $getRoot().getFirstDescendant();
        expect($isTextNode(node) && node.hasFormat('bold')).toBe(true);
        expect($getNodeByKey(saved.anchor.key)?.isAttached() ?? false).toBe(false);
      });
      editor.setEditable(false);
      const before = JSON.stringify(owner.export().editorData);
      expect(
        applyNativeToolbarAction(editor, saved, () =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
        ),
      ).toBe(false);
      expect(JSON.stringify(owner.export().editorData)).toBe(before);
    } finally {
      owner.destroy();
    }
  });
});
