import { describe, expect, it } from 'vitest';

import diffDocument from './__fixtures__/lobehub-diff-document.json';
import embedsDocument from './__fixtures__/lobehub-embeds-document.json';
import markdownDocument from './__fixtures__/lobehub-markdown-document.json';
import {
  convertLegacyEditorState,
  type SerializedEditorStateLike,
  type SerializedNodeLike,
} from './convertLegacyEditorState';

// The three JSON fixtures were exported by @lobehub/editor 4.29.2's headless
// editor (`hydrateMarkdown` / `hydrateEditorData` + `export().editorData`), so
// they carry the exact fields its serializers write, including node identity.

/** Every node type the shadcn-editor Editor X build (plus Orvilo's chat nodes) can load. */
const TARGET_TYPES = new Set([
  'action-tag',
  'autolink',
  'code',
  'code-highlight',
  'collapsible-container',
  'collapsible-content',
  'collapsible-title',
  'emoji',
  'equation',
  'hashtag',
  'heading',
  'horizontalrule',
  'image',
  'linebreak',
  'link',
  'list',
  'listitem',
  'local-file-tag',
  'mention',
  'paragraph',
  'quote',
  'refer-topic',
  'root',
  'tab',
  'table',
  'tablecell',
  'tablerow',
  'text',
]);

const BLOCK_PARENTS = new Set(['root', 'tablecell', 'collapsible-content']);
const INLINE_PARENTS = new Set(['paragraph', 'heading', 'link', 'autolink', 'collapsible-title']);
const INLINE_TYPES = new Set([
  'action-tag',
  'autolink',
  'image',
  'linebreak',
  'link',
  'local-file-tag',
  'mention',
  'refer-topic',
  'tab',
  'text',
]);

const children = (node: SerializedNodeLike) => (node.children ?? []) as SerializedNodeLike[];

const walk = (node: SerializedNodeLike, visit: (node: SerializedNodeLike) => void) => {
  visit(node);
  children(node).forEach((child) => walk(child, visit));
};

const types = (state: SerializedEditorStateLike) => {
  const found = new Set<string>();
  walk(state.root, (node) => found.add(node.type));
  return found;
};

/** Assert the converted tree only uses target node types in valid positions. */
const expectLoadableShape = (state: SerializedEditorStateLike) => {
  walk(state.root, (node) => {
    expect(TARGET_TYPES, `unexpected node type ${node.type}`).toContain(node.type);
    expect(node).not.toHaveProperty('id');
    expect((node.$ as Record<string, unknown> | undefined)?.properties).toBeUndefined();

    const isInline = (child: SerializedNodeLike) =>
      INLINE_TYPES.has(child.type) || (child.type === 'equation' && child.inline === true);

    if (BLOCK_PARENTS.has(node.type)) {
      for (const child of children(node)) {
        expect(isInline(child), `${child.type} directly inside ${node.type}`).toBe(false);
      }
    }
    if (INLINE_PARENTS.has(node.type)) {
      for (const child of children(node)) {
        expect(isInline(child), `${child.type} inside ${node.type}`).toBe(true);
      }
    }
  });
  expect(children(state.root).length).toBeGreaterThan(0);
};

/** Visible text in document order, by each editor's own text semantics. */
const legacyText = (node: SerializedNodeLike): string[] => {
  switch (node.type) {
    case 'cursor':
    case 'PlaceholderInline':
    case 'PlaceholderBlock': {
      return [];
    }
    case 'text': {
      return [node.text as string];
    }
    case 'mention': {
      return [node.label as string];
    }
    case 'math':
    case 'mathBlock': {
      return [node.code as string];
    }
    case 'code': {
      return Array.isArray(node.children)
        ? children(node).flatMap(legacyText)
        : [node.code as string];
    }
    case 'file': {
      return [node.name as string];
    }
    default: {
      return children(node).flatMap(legacyText);
    }
  }
};

const convertedText = (node: SerializedNodeLike): string[] => {
  switch (node.type) {
    case 'text':
    case 'mention': {
      return [node.text as string];
    }
    case 'equation': {
      return [node.equation as string];
    }
    case 'code': {
      return [
        children(node)
          .map((child) => (child.type === 'linebreak' ? '\n' : (child.text as string)))
          .join(''),
      ];
    }
    default: {
      return children(node).flatMap(convertedText);
    }
  }
};

const collect = (state: SerializedEditorStateLike, type: string) => {
  const found: SerializedNodeLike[] = [];
  walk(state.root, (node) => {
    if (node.type === type) found.push(node);
  });
  return found;
};

const t = (text: string, format = 0) => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});
const el = (type: string, extra: Record<string, unknown>, ...kids: unknown[]) => ({
  children: kids,
  direction: 'ltr',
  format: '',
  indent: 0,
  type,
  version: 1,
  ...extra,
});
const p = (...kids: unknown[]) => el('paragraph', { textFormat: 0, textStyle: '' }, ...kids);
const doc = (...kids: unknown[]) => ({ root: el('root', {}, ...kids) });

describe('convertLegacyEditorState', () => {
  describe('markdown-built document', () => {
    const legacy = markdownDocument as unknown as SerializedEditorStateLike;
    const { changed, editorState, report } = convertLegacyEditorState(legacy);

    it('produces only loadable target nodes and keeps all text', () => {
      expect(changed).toBe(true);
      expectLoadableShape(editorState);
      expect(convertedText(editorState.root)).toEqual(legacyText(legacy.root));
    });

    it('keeps shared Lexical nodes and their attributes', () => {
      const lists = collect(editorState, 'list');
      expect(lists.map((list) => list.listType)).toEqual(['bullet', 'bullet', 'number', 'check']);
      expect(collect(editorState, 'listitem').map((item) => item.checked)).toContain(true);
      expect(collect(editorState, 'table')[0].colWidths).toEqual([375, 375]);
      expect(collect(editorState, 'link')[0]).toMatchObject({ url: 'https://example.com' });
      expect(collect(editorState, 'heading')[0]).toMatchObject({ tag: 'h1' });
      expect(collect(editorState, 'horizontalrule')).toHaveLength(1);
    });

    it('turns inline code into code-formatted text and drops cursor nodes', () => {
      expect(types(editorState).has('cursor')).toBe(false);
      expect(
        collect(editorState, 'text').find((node) => node.text === 'inline code'),
      ).toMatchObject({ format: 16 });
      expect(report.dropped.cursor).toBe(3);
    });

    it('maps math, CodeMirror blocks, images and collapsibles to Editor X nodes', () => {
      expect(collect(editorState, 'equation')).toEqual([
        { equation: 'E=mc^2', inline: true, type: 'equation', version: 1 },
        { equation: 'x^2', inline: false, type: 'equation', version: 1 },
      ]);

      const [code] = collect(editorState, 'code');
      expect(code).toMatchObject({ language: 'typescript' });
      expect(children(code)).toEqual([t('const a = 1;')]);

      const image = collect(editorState, 'image')[0];
      expect(image).toEqual({
        altText: 'alt text',
        maxWidth: 4200,
        src: 'https://example.com/a.png',
        type: 'image',
        version: 1,
      });

      const [container] = collect(editorState, 'collapsible-container');
      expect(container.open).toBe(true);
      const [title, content] = children(container);
      expect(convertedText(title)).toEqual(['More']);
      expect(convertedText(content)).toEqual(['Hidden body']);
    });

    it('wraps the former block image in a paragraph', () => {
      const imageParent = children(editorState.root).find((node) =>
        children(node).some((child) => child.type === 'image'),
      );
      expect(imageParent?.type).toBe('paragraph');
    });
  });

  describe('embeds document', () => {
    const legacy = embedsDocument as unknown as SerializedEditorStateLike;
    const { editorState } = convertLegacyEditorState(legacy);

    it('converts mentions to text mentions that keep their metadata', () => {
      expectLoadableShape(editorState);
      expect(collect(editorState, 'mention')).toEqual([
        {
          detail: 1,
          format: 0,
          mentionName: 'Ada',
          metadata: { id: 'agt_1', type: 'agent' },
          mode: 'segmented',
          style: '',
          text: 'Ada',
          type: 'mention',
          version: 1,
        },
      ]);
    });

    it('keeps inline image size and degrades file attachments to links', () => {
      expect(collect(editorState, 'image')[0]).toMatchObject({ width: 320 });
      expect(collect(editorState, 'image')[0]).not.toHaveProperty('height');
      expect(collect(editorState, 'link')[0]).toMatchObject({
        children: [t('report.pdf')],
        target: '_blank',
        url: 'https://cdn.example.com/r.pdf',
      });
      expect(convertedText(editorState.root)).toEqual(legacyText(legacy.root));
    });
  });

  describe('link family, chat decorators and unknown nodes', () => {
    // Shapes follow each node's exportJSON in @lobehub/editor 4.29.2 and the
    // Orvilo chat-input nodes in src/features/ChatInput/InputEditor.
    const legacy = doc(
      p(
        t('card '),
        {
          description: 'desc',
          icon: '',
          openTarget: '_blank',
          title: 'Example A',
          type: 'link-card',
          url: 'https://example.com/a',
          version: 1,
        },
        t(' schema '),
        {
          payload: { id: 'T-1' },
          schemaType: 'task',
          title: 'T-1',
          type: 'schema-link',
          url: 'orvilo://task/T-1',
          version: 1,
        },
        t(' '),
        el('linkHighlight', {}, t('www.example.org')),
        t(' '),
        el(
          'autolink',
          { isUnlinked: false, rel: null, target: null, title: null, url: 'https://a.example' },
          t('https://a.example'),
        ),
      ),
      {
        description: '',
        icon: '',
        openTarget: '_blank',
        title: 'Example B',
        type: 'link-block-card',
        url: 'https://example.com/b',
        version: 1,
      },
      {
        src: 'https://www.youtube.com/embed/x',
        title: 'Video',
        type: 'link-iframe',
        url: 'https://www.youtube.com/watch?v=x',
        version: 1,
      },
      p(
        t('ask '),
        { topicId: 'tpc_1', topicTitle: 'Roadmap', type: 'refer-topic', version: 1 },
        t(' '),
        {
          actionCategory: 'skill',
          actionLabel: 'Search',
          actionType: 'search',
          type: 'action-tag',
          version: 1,
        },
        t(' '),
        { isDirectory: false, name: 'a.ts', path: '/w/a.ts', type: 'local-file-tag', version: 1 },
        el('PlaceholderInline', {}, t(' ghost suggestion')),
      ),
      el('toc', {}, p(t('unknown block'))),
      { title: 'legacy widget', type: 'mystery-widget', version: 1 },
    );
    const { editorState, report } = convertLegacyEditorState(legacy);

    it('maps link nodes onto Lexical links and unsafe schemes onto text', () => {
      expectLoadableShape(editorState);
      const links = collect(editorState, 'link');
      expect(links.map((link) => [link.url, convertedText(link).join('')])).toEqual([
        ['https://example.com/a', 'Example A'],
        ['https://www.example.org', 'www.example.org'],
        ['https://example.com/b', 'Example B'],
        ['https://www.youtube.com/watch?v=x', 'Video'],
      ]);
      expect(collect(editorState, 'autolink')[0]).toMatchObject({ isUnlinked: false });
      expect(convertedText(children(editorState.root)[0])).toContain('T-1');
    });

    it('keeps Orvilo chat decorators unchanged and drops autocomplete ghosts', () => {
      expect(collect(editorState, 'refer-topic')[0]).toEqual({
        topicId: 'tpc_1',
        topicTitle: 'Roadmap',
        type: 'refer-topic',
        version: 1,
      });
      expect(collect(editorState, 'action-tag')).toHaveLength(1);
      expect(collect(editorState, 'local-file-tag')).toHaveLength(1);
      expect(JSON.stringify(editorState)).not.toContain('ghost suggestion');
    });

    it('degrades unknown nodes to their text', () => {
      const text = convertedText(editorState.root);
      expect(text).toContain('unknown block');
      expect(text).toContain('legacy widget');
      expect(report.degraded).toMatchObject({ 'mystery-widget': 1, 'toc': 1 });
    });
  });

  describe('pending AI review (diff) nodes', () => {
    it('rejects block diffs exported by the editor, keeping the original text', () => {
      const { editorState, report } = convertLegacyEditorState(diffDocument);

      expectLoadableShape(editorState);
      expect(children(editorState.root).map((node) => convertedText(node).join(''))).toEqual([
        'old paragraph',
        'old A',
        'old B',
        'removed by AI',
        'unchanged',
      ]);
      expect(report.rejectedDiffs).toBe(5);
    });

    it('rejects list item diffs like DiffAction.Reject', () => {
      const legacy = doc(
        el(
          'list',
          { listType: 'bullet', start: 1, tag: 'ul' },
          el(
            'listitem',
            { value: 1 },
            el('diff', { diffType: 'listItemModify' }, p(t('item old')), p(t('item new'))),
          ),
          el('listitem', { value: 2 }, el('diff', { diffType: 'listItemAdd' }, t('item added'))),
          el('listitem', { value: 3 }, el('diff', { diffType: 'listItemRemove' }, t('item kept'))),
        ),
      );
      const { editorState } = convertLegacyEditorState(legacy);

      expectLoadableShape(editorState);
      const items = collect(editorState, 'listitem');
      expect(items.map((item) => convertedText(item).join(''))).toEqual(['item old', 'item kept']);
      expect(children(items[0])).toEqual([t('item old')]);
    });

    it('rejects table row and cell diffs and shrinks removed columns', () => {
      const cell = (text: string, extra: Record<string, unknown> = {}) =>
        el(
          'tablecell',
          { backgroundColor: null, colSpan: 1, headerState: 0, rowSpan: 1, ...extra },
          p(t(text)),
        );
      const cellDiff = (text: string, diffType: string, changeId: string) =>
        el(
          'table-cell-diff',
          { backgroundColor: null, changeId, colSpan: 1, diffType, headerState: 0, rowSpan: 1 },
          el('diff', { diffType }, p(t(text))),
        );
      const legacy = doc(
        el(
          'table',
          { colWidths: [100, 120, 140] },
          el('tablerow', { height: 33 }, cell('a1'), cellDiff('new col', 'add', 'c1'), cell('a3')),
          el('tablerow', { height: 33 }, cell('b1'), cellDiff('new col', 'add', 'c1'), cell('b3')),
          el(
            'table-row-diff',
            { changeId: 'r1', diffType: 'remove', height: 33 },
            cell('old 1'),
            cellDiff('x', 'add', 'c1'),
            cell('old 3'),
          ),
          el(
            'table-row-diff',
            { changeId: 'r1', diffType: 'add', height: 33 },
            cell('new 1'),
            cell('new 2'),
            cell('new 3'),
          ),
          el(
            'tablerow',
            { height: 33 },
            cell('c1'),
            cellDiff('removed cell', 'remove', 'c2'),
            cell('c3'),
          ),
        ),
      );
      const { editorState } = convertLegacyEditorState(legacy);

      expectLoadableShape(editorState);
      const [table] = collect(editorState, 'table');
      expect(children(table).map((row) => row.type)).toEqual([
        'tablerow',
        'tablerow',
        'tablerow',
        'tablerow',
      ]);
      expect(children(table).map((row) => convertedText(row))).toEqual([
        ['a1', 'a3'],
        ['b1', 'b3'],
        ['old 1', 'old 3'],
        ['c1', 'removed cell', 'c3'],
      ]);
      // The added column is gone from three of the four rows, so the width stays.
      expect(table.colWidths).toEqual([100, 120, 140]);
      expect(JSON.stringify(editorState)).not.toMatch(/changeId|diffType/);
    });

    it('drops the width of a column added to every row', () => {
      const cell = (text: string) => el('tablecell', { colSpan: 1, headerState: 0 }, p(t(text)));
      const added = el(
        'table-cell-diff',
        { changeId: 'c', colSpan: 1, diffType: 'add' },
        p(t('x')),
      );
      const legacy = doc(
        el(
          'table',
          { colWidths: [100, 120] },
          el('tablerow', {}, cell('a'), added),
          el('tablerow', {}, cell('b'), added),
        ),
      );

      expect(collect(convertLegacyEditorState(legacy).editorState, 'table')[0].colWidths).toEqual([
        100,
      ]);
    });
  });

  describe('contract', () => {
    it('is idempotent', () => {
      for (const fixture of [markdownDocument, embedsDocument, diffDocument]) {
        const once = convertLegacyEditorState(fixture).editorState;
        const twice = convertLegacyEditorState(once);

        expect(twice.changed).toBe(false);
        expect(twice.editorState).toEqual(once);
      }
    });

    it('does not mutate its input and accepts a JSON string', () => {
      const snapshot = JSON.stringify(markdownDocument);
      const fromObject = convertLegacyEditorState(markdownDocument).editorState;

      expect(JSON.stringify(markdownDocument)).toBe(snapshot);
      expect(convertLegacyEditorState(snapshot).editorState).toEqual(fromObject);
    });

    it('keeps an empty document loadable', () => {
      const { editorState } = convertLegacyEditorState(
        doc(el('diff', { diffType: 'add' }, p(t('x')))),
      );

      expect(children(editorState.root)).toEqual([
        {
          children: [],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ]);
    });

    it('rejects input without a Lexical root', () => {
      expect(() => convertLegacyEditorState({})).toThrow(TypeError);
      expect(() => convertLegacyEditorState(null)).toThrow(TypeError);
    });
  });
});
