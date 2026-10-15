import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  IS_BOLD,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { describe, expect, it } from 'vitest';

import { EditorRuntime } from '../EditorRuntime';
import {
  createHeadlessEditor,
  DiffAction,
  LITEXML_DIFFNODE_ALL_COMMAND,
  nativeEditorRuntimeCommands,
} from '../native-headless';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isRecord(value)) return [];
  return [
    ...(typeof value.type === 'string' ? [value] : []),
    ...Object.values(value).flatMap(nodes),
  ];
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const paragraphId = (xml?: string) => {
  const id = xml?.match(/<p id="([^"]+)"/u)?.[1];
  if (!id) throw new Error('Actual paragraph ID is required');
  return id;
};
async function propose(editor: ReturnType<typeof createHeadlessEditor>) {
  const runtime = new EditorRuntime();
  runtime.setEditor(editor.kernel, nativeEditorRuntimeCommands);
  const id = paragraphId(editor.export({ litexml: true }).litexml);
  const result = await runtime.modifyNodes({
    operations: [{ action: 'modify', litexml: `<p id="${id}">After proposal</p>` }],
  });
  expect(result.successCount).toBe(1);
  const pending = editor.export().editorData;
  expect(nodes(pending).some((node) => node.type === 'diff')).toBe(true);
  expect(JSON.stringify(pending)).toContain('Before proposal');
  expect(JSON.stringify(pending)).toContain('After proposal');
}

describe('isolated owned headless capability evidence', () => {
  it('accepts an actual pending diff and removes old-side content', async () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('Before proposal');
      await propose(editor);
      editor.kernel.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, { action: DiffAction.Accept });
      await tick();
      const accepted = editor.export().editorData;
      expect(nodes(accepted).some((node) => node.type === 'diff')).toBe(false);
      expect(JSON.stringify(accepted)).toContain('After proposal');
      expect(JSON.stringify(accepted)).not.toContain('Before proposal');
    } finally {
      editor.destroy();
    }
  });
  it('rejects an independent pending diff and restores old-side content', async () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('Before proposal');
      await propose(editor);
      editor.kernel.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, { action: DiffAction.Reject });
      await tick();
      const rejected = editor.export().editorData;
      expect(nodes(rejected).some((node) => node.type === 'diff')).toBe(false);
      expect(JSON.stringify(rejected)).toContain('Before proposal');
      expect(JSON.stringify(rejected)).not.toContain('After proposal');
    } finally {
      editor.destroy();
    }
  });
  it('undoes and redoes a real history transaction', async () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('History original');
      await tick();
      const lexical = editor.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Actual Lexical instance required');
      lexical.update(
        () => {
          $getRoot()
            .clear()
            .append($createParagraphNode().append($createTextNode('History changed')));
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      );
      await tick();
      expect(editor.export().markdown).toContain('History changed');
      editor.kernel.dispatchCommand(UNDO_COMMAND, undefined);
      await tick();
      expect(editor.export().markdown).toContain('History original');
      expect(editor.export().markdown).not.toContain('History changed');
      editor.kernel.dispatchCommand(REDO_COMMAND, undefined);
      await tick();
      expect(editor.export().markdown).toContain('History changed');
    } finally {
      editor.destroy();
    }
  });
  it('retains actual math nodes/TeX and CJK bold formatting before and after hydration', () => {
    const first = createHeadlessEditor();
    const second = createHeadlessEditor();
    try {
      first.hydrateMarkdown('中文 **加粗**\n\n$E=mc^2$');
      const snapshot = first.export();
      for (const data of [snapshot.editorData]) {
        const all = nodes(data);
        expect(all.some((node) => node.type === 'math' && node.code === 'E=mc^2')).toBe(true);
        expect(
          all.some(
            (node) =>
              node.type === 'text' &&
              node.text === '加粗' &&
              typeof node.format === 'number' &&
              (node.format & IS_BOLD) !== 0,
          ),
        ).toBe(true);
      }
      second.hydrateEditorData(snapshot.editorData, { keepId: true });
      const all = nodes(second.export().editorData);
      expect(all.some((node) => node.type === 'math' && node.code === 'E=mc^2')).toBe(true);
      expect(
        all.some(
          (node) =>
            node.type === 'text' &&
            node.text === '加粗' &&
            typeof node.format === 'number' &&
            (node.format & IS_BOLD) !== 0,
        ),
      ).toBe(true);
    } finally {
      first.destroy();
      second.destroy();
    }
  });
  it('round-trips real table rows/cells and modifies a table cell through LiteXML', async () => {
    const first = createHeadlessEditor();
    const second = createHeadlessEditor();
    try {
      first.hydrateMarkdown('| Name | Value |\n| --- | --- |\n| Alpha | One |');
      const snapshot = first.export({ litexml: true });
      const all = nodes(snapshot.editorData);
      expect(all.filter((node) => node.type === 'table')).toHaveLength(1);
      expect(all.filter((node) => node.type === 'tablerow')).toHaveLength(2);
      expect(all.filter((node) => node.type === 'tablecell')).toHaveLength(4);
      second.hydrateEditorData(snapshot.editorData, { keepId: true });
      expect(second.export().editorData).toEqual(snapshot.editorData);
      const cell = second.export({ litexml: true }).litexml?.match(/<(td|th) id="([^"]+)"/u);
      if (!cell) throw new Error('Real table cell XML ID required');
      const runtime = new EditorRuntime();
      runtime.setEditor(second.kernel, nativeEditorRuntimeCommands);
      const result = await runtime.modifyNodes({
        operations: [
          {
            action: 'modify',
            litexml: `<${cell[1]} id="${cell[2]}"><p>Updated cell</p></${cell[1]}>`,
          },
        ],
      });
      expect(result.successCount).toBe(1);
      expect(second.export().markdown).toContain('Updated cell');
      expect(
        nodes(second.export().editorData).filter((node) => node.type === 'table'),
      ).toHaveLength(1);
    } finally {
      first.destroy();
      second.destroy();
    }
  });
});
