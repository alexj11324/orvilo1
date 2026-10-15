import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { getFixedT } from 'i18next';
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $setSelection,
  createCommand,
  KEY_ARROW_DOWN_COMMAND,
  type LexicalCommand,
  type LexicalNode,
} from 'lexical';
import { describe, expect, it } from 'vitest';

import {
  INSERT_ACTION_TAG_COMMAND,
  type InsertActionTagPayload,
} from '../InputEditor/ActionTag/command';
import { nativeChatEmbedPlugins } from './embedPlugins';
import { INSERT_LOCAL_FILE_TAG_COMMAND } from './LocalFileTagPlugin';
import { INSERT_REFER_TOPIC_COMMAND } from './ReferTopicPlugin';

function createEditor() {
  const editor = createHeadlessEditor({
    additionalPlugins: nativeChatEmbedPlugins(getFixedT('en', 'editor')),
  });
  editor.kernel.getLexicalEditor()?.setEditable(true);
  return editor;
}

type Editor = ReturnType<typeof createEditor>;

function dispatch<T>(editor: Editor, command: LexicalCommand<T>, payload: T): boolean {
  const lexical = editor.kernel.getLexicalEditor();
  if (!lexical) throw new Error('Actual native kernel unavailable');
  let handled = false;
  lexical.update(
    () => {
      if (!$getSelection()) $getRoot().selectEnd();
      handled = lexical.dispatchCommand(command, payload);
    },
    { discrete: true },
  );
  return handled;
}

function seedTags(editor: Editor) {
  expect(
    dispatch(editor, INSERT_ACTION_TAG_COMMAND, {
      category: 'projectSkill',
      label: 'Build project',
      type: 'build-project',
    }),
  ).toBe(true);
  expect(
    dispatch(editor, INSERT_LOCAL_FILE_TAG_COMMAND, {
      isDirectory: true,
      name: 'a & b',
      path: '/workspace/a & b',
    }),
  ).toBe(true);
  expect(
    dispatch(editor, INSERT_REFER_TOPIC_COMMAND, {
      topicId: 'topic-123',
      topicTitle: 'Context & notes',
    }),
  ).toBe(true);
}

function tags(editor: Editor) {
  const lexical = editor.kernel.getLexicalEditor();
  if (!lexical) throw new Error('Actual native kernel unavailable');
  return lexical.read(() => {
    const result: unknown[] = [];
    const visit = (node: LexicalNode): void => {
      if (['action-tag', 'local-file-tag', 'refer-topic'].includes(node.getType()))
        result.push(node.exportJSON());
      if ($isElementNode(node)) {
        for (const child of node.getChildren()) visit(child);
      }
    };
    for (const node of $getRoot().getChildren()) visit(node);
    return result;
  });
}

function expectMetadata(editor: Editor) {
  expect(tags(editor)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'action-tag',
        actionCategory: 'projectSkill',
        actionLabel: 'Build project',
        actionType: 'build-project',
      }),
      expect.objectContaining({
        type: 'local-file-tag',
        isDirectory: true,
        name: 'a & b',
        path: '/workspace/a & b',
      }),
      expect.objectContaining({
        type: 'refer-topic',
        topicId: 'topic-123',
        topicTitle: 'Context & notes',
      }),
    ]),
  );
}

describe('actual native chat embed plugin composition', () => {
  it.each(['json', 'litexml'] as const)(
    'roundtrips all three chip metadata through registered %s codecs',
    (format) => {
      const source = createEditor();
      const restored = createEditor();
      try {
        seedTags(source);
        expectMetadata(source);
        const data = source.kernel.getDocument(format);
        expect(data).toBeTruthy();
        restored.kernel.setDocument(format, data, { keepId: true });
        expectMetadata(restored);
        const markdown = restored.kernel.getDocument('markdown');
        expect(markdown).toContain('<skill name="build-project" label="Build project" />');
        expect(markdown).toContain('name="a &amp; b"');
        expect(markdown).toContain('path="/workspace/a &amp; b"');
        expect(markdown).toContain('isDirectory');
        expect(markdown).toContain('<refer_topic name="Context &amp; notes" id="topic-123" />');
      } finally {
        source.destroy();
        restored.destroy();
      }
    },
  );

  it('does not confuse a same-name command with the actual registered identity', () => {
    const editor = createEditor();
    try {
      const lookalike = createCommand<InsertActionTagPayload>('INSERT_ACTION_TAG_COMMAND');
      expect(
        dispatch(editor, lookalike, { category: 'tool', label: 'Wrong identity', type: 'wrong' }),
      ).toBe(false);
      expect(tags(editor)).toHaveLength(0);
      expect(
        dispatch(editor, INSERT_ACTION_TAG_COMMAND, {
          category: 'tool',
          label: 'Actual identity',
          type: 'actual',
        }),
      ).toBe(true);
      expect(tags(editor)).toEqual([expect.objectContaining({ actionType: 'actual' })]);
    } finally {
      editor.destroy();
    }
  });

  it('keeps selection, plugin commands and readonly state scoped to their own kernel', () => {
    const first = createEditor();
    const second = createEditor();
    try {
      seedTags(first);
      seedTags(second);
      const a = first.kernel.getLexicalEditor();
      const b = second.kernel.getLexicalEditor();
      if (!a || !b) throw new Error('Actual native kernels unavailable');
      a.update(() => $getRoot().selectStart(), { discrete: true });
      b.update(() => $getRoot().selectEnd(), { discrete: true });
      const secondSelection = b.read(() => $getSelection()?.clone());
      const secondDocument = second.kernel.getDocument('json');
      b.setEditable(false);
      expect(a.isEditable()).toBe(true);
      expect(b.isEditable()).toBe(false);
      dispatch(first, INSERT_REFER_TOPIC_COMMAND, {
        topicId: 'only-first',
        topicTitle: 'Only first',
      });
      expect(second.kernel.getDocument('json')).toEqual(secondDocument);
      expect(b.read(() => $getSelection()?.is(secondSelection ?? null))).toBe(true);
      expect(tags(first)).toEqual(
        expect.arrayContaining([expect.objectContaining({ topicId: 'only-first' })]),
      );
      expect(tags(second)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ topicId: 'only-first' })]),
      );
    } finally {
      first.destroy();
      second.destroy();
    }
  });

  it('does not insert tags through their real commands while readonly', () => {
    const editor = createEditor();
    try {
      seedTags(editor);
      const lexical = editor.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Actual native kernel unavailable');
      lexical.setEditable(false);
      const before = editor.kernel.getDocument('json');
      dispatch(editor, INSERT_ACTION_TAG_COMMAND, {
        category: 'tool',
        label: 'Blocked',
        type: 'blocked',
      });
      dispatch(editor, INSERT_LOCAL_FILE_TAG_COMMAND, { name: 'blocked', path: '/blocked' });
      dispatch(editor, INSERT_REFER_TOPIC_COMMAND, { topicId: 'blocked', topicTitle: 'Blocked' });
      expect(editor.kernel.getDocument('json')).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it('does not synthesize a virtual paragraph from readonly arrow navigation', () => {
    const editor = createEditor();
    try {
      seedTags(editor);
      const lexical = editor.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Actual native kernel unavailable');
      lexical.update(
        () => {
          const last = $getRoot().getLastDescendant();
          if (!last) throw new Error('Actual tag fixture missing');
          const selection = $createNodeSelection();
          selection.add(last.getKey());
          $setSelection(selection);
        },
        { discrete: true },
      );
      lexical.setEditable(false);
      const before = editor.kernel.getDocument('json');
      dispatch(editor, KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(editor.kernel.getDocument('json')).toEqual(before);
    } finally {
      editor.destroy();
    }
  });
});
