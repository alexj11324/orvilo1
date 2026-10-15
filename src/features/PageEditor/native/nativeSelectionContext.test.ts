import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { $createRangeSelection, $getRoot, $isTextNode, $setSelection } from 'lexical';
import { describe, expect, it } from 'vitest';

import { captureNativeSelectionContext } from './nativeSelectionContext';

function selectFirstText(
  editor: ReturnType<typeof createHeadlessEditor>,
  start: number,
  end: number,
) {
  const lexical = editor.kernel.getLexicalEditor();
  if (!lexical) throw new Error('Actual native kernel failed to initialize');
  lexical.update(
    () => {
      const text = $getRoot().getFirstDescendant();
      if (!$isTextNode(text)) throw new Error('Actual fixture must have a first TextNode');
      text.select(start, end);
    },
    { discrete: true },
  );
}

describe('native selection context with actual kernel and registered codecs', () => {
  it('sends only the real selected fragment and keeps its document identity', () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('Hello world');
      selectFirstText(editor, 0, 5);
      const result = captureNativeSelectionContext({
        editor: editor.kernel,
        documentId: 'native-doc',
        title: 'Selection',
        id: 'selection-test',
      });
      expect(result).toMatchObject({
        id: 'selection-test',
        pageId: 'native-doc',
        type: 'text',
        format: 'xml',
      });
      expect(result?.content).toContain('Hello');
      expect(result?.content).not.toContain('world');
      expect(result?.preview).toBe('Hello');
    } finally {
      editor.destroy();
    }
  });
  it.each([false, true])(
    'clips formatted inline nodes using actual codecs, reversed: %s',
    (reversed) => {
      const editor = createHeadlessEditor();
      const roundtrip = createHeadlessEditor();
      try {
        editor.hydrateMarkdown('**Hello world**');
        selectFirstText(editor, reversed ? 5 : 1, reversed ? 1 : 5);
        const before = editor.kernel.getDocument('litexml');
        const result = captureNativeSelectionContext({
          editor: editor.kernel,
          documentId: 'rich-doc',
          title: 'Rich selection',
          id: 'rich-fragment',
        });
        expect(result?.format).toBe('xml');
        expect(result?.preview).toBe('ello');
        expect(result?.content).toContain('ello');
        expect(result?.content).not.toContain('world');
        expect(editor.kernel.getDocument('litexml')).toBe(before);
        if (!result) throw new Error('Actual selected fragment must serialize');
        roundtrip.hydrateLiteXML(result.content, { keepId: true });
        const lexical = roundtrip.kernel.getLexicalEditor();
        if (!lexical) throw new Error('Roundtrip kernel unavailable');
        lexical.read(() => {
          expect($getRoot().getTextContent()).toBe('ello');
          const text = $getRoot().getFirstDescendant();
          expect($isTextNode(text) && text.hasFormat('bold')).toBe(true);
        });
      } finally {
        editor.destroy();
        roundtrip.destroy();
      }
    },
  );

  it.each([false, true])('retains mixed rich range boundaries, reversed: %s', (reversed) => {
    const editor = createHeadlessEditor();
    const roundtrip = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('**Hello** world *tail hidden*');
      const lexical = editor.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Actual kernel unavailable');
      lexical.update(
        () => {
          const texts = $getRoot().getAllTextNodes();
          const first = texts[0];
          const last = texts.at(-1);
          if (!first || !last) throw new Error('Rich fixture text nodes missing');
          const selection = $createRangeSelection();
          selection.anchor.set((reversed ? last : first).getKey(), reversed ? 2 : 1, 'text');
          selection.focus.set((reversed ? first : last).getKey(), reversed ? 1 : 2, 'text');
          $setSelection(selection);
        },
        { discrete: true },
      );
      const result = captureNativeSelectionContext({
        editor: editor.kernel,
        documentId: 'mixed-doc',
        title: 'Mixed rich selection',
        id: 'mixed-fragment',
      });
      expect(result?.preview).toBe('ello world ta');
      expect(result?.content).not.toContain('hidden');
      if (!result) throw new Error('Mixed rich fragment missing');
      roundtrip.hydrateLiteXML(result.content, { keepId: true });
      const target = roundtrip.kernel.getLexicalEditor();
      if (!target) throw new Error('Roundtrip kernel unavailable');
      target.read(() => {
        expect($getRoot().getTextContent()).toBe('ello world ta');
        const nodes = $getRoot().getAllTextNodes();
        expect(
          nodes.some((node) => node.getTextContent() === 'ello' && node.hasFormat('bold')),
        ).toBe(true);
        expect(
          nodes.some((node) => node.getTextContent() === 'ta' && node.hasFormat('italic')),
        ).toBe(true);
      });
    } finally {
      editor.destroy();
      roundtrip.destroy();
    }
  });
  it('does not send the entire document when the actual selection is collapsed', () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown('Unsliced document must not leak into composer');
      selectFirstText(editor, 4, 4);
      expect(
        captureNativeSelectionContext({
          editor: editor.kernel,
          documentId: 'doc',
          title: 'Selection',
          id: 'empty',
        }),
      ).toBeUndefined();
    } finally {
      editor.destroy();
    }
  });
  it('keeps simultaneous native editor selections isolated', () => {
    const first = createHeadlessEditor();
    const second = createHeadlessEditor();
    try {
      first.hydrateMarkdown('First source');
      second.hydrateMarkdown('Other source');
      selectFirstText(first, 0, 5);
      selectFirstText(second, 0, 5);
      const firstContext = captureNativeSelectionContext({
        editor: first.kernel,
        documentId: 'first',
        title: 'Selection',
        id: 'one',
      });
      const secondContext = captureNativeSelectionContext({
        editor: second.kernel,
        documentId: 'second',
        title: 'Selection',
        id: 'two',
      });
      expect(firstContext?.preview).toBe('First');
      expect(firstContext?.pageId).toBe('first');
      expect(secondContext?.preview).toBe('Other');
      expect(secondContext?.pageId).toBe('second');
    } finally {
      first.destroy();
      second.destroy();
    }
  });
});
