import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { describe, expect, it } from 'vitest';

import { computeLexicalDiffRows } from './vendor/compute.js';

describe('owned professional structural history diff', () => {
  it('retains complete rich JSON blocks and never mutates equal inputs', () => {
    const editor = createHeadlessEditor();
    try {
      editor.hydrateMarkdown(
        '# Heading\n\n**Bold** and `inline`\n\n- List item\n\n```typescript\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |',
      );
      const state = editor.export().editorData;
      const before = JSON.stringify(state);
      const rows = computeLexicalDiffRows(state, state);
      expect(rows.length).toBe(state.root.children.length);
      for (const [index, row] of rows.entries()) {
        expect(row.kind).toBe('equal');
        expect(row.oldCell?.block).toEqual(state.root.children[index]);
        expect(row.newCell?.block).toEqual(state.root.children[index]);
      }
      expect(JSON.stringify(state)).toBe(before);
      expect(before).toContain('"type":"code"');
      expect(before).toContain('"type":"table"');
    } finally {
      editor.destroy();
    }
  });

  it('keeps old/new structure and applies semantic inline change marks', () => {
    const oldEditor = createHeadlessEditor();
    const newEditor = createHeadlessEditor();
    try {
      oldEditor.hydrateMarkdown('The old value');
      newEditor.hydrateMarkdown('The new value');
      const oldState = oldEditor.export().editorData;
      const newState = newEditor.export().editorData;
      const originalOld = JSON.stringify(oldState);
      const originalNew = JSON.stringify(newState);
      const rows = computeLexicalDiffRows(oldState, newState);
      const serialized = JSON.stringify(rows);
      expect(rows.some((row) => row.kind !== 'equal')).toBe(true);
      expect(serialized).toContain('var(--destructive-wash)');
      expect(serialized).toContain('var(--success-wash)');
      expect(serialized).toContain('"type":"paragraph"');
      expect(JSON.stringify(oldState)).toBe(originalOld);
      expect(JSON.stringify(newState)).toBe(originalNew);
    } finally {
      oldEditor.destroy();
      newEditor.destroy();
    }
  });
});
