import { describe, expect, it, vi } from 'vitest';

import { EditorRuntime } from '../EditorRuntime';
import { createSDKPublicEditorFixture } from './sdkPublicEditorFixture';

// Real SDK parsing/preflight/listeners, not dispatch mocks or approximate XML checks.
describe('confirmed LiteXML operation results', () => {
  it('rejects missing remove/modify/insert targets and preserves a valid sibling operation', async () => {
    const headless = createSDKPublicEditorFixture();
    try {
      headless.hydrateMarkdown('Original text');
      const id = headless.export({ litexml: true }).litexml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture paragraph requires its actual ID');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const after = vi.fn();
      runtime.setAfterMutateHandler(after);
      const result = await runtime.modifyNodes({
        operations: [
          { action: 'remove', id: 'missing-remove' },
          { action: 'modify', litexml: '<p id="missing-modify">Incorrect</p>' },
          { action: 'insert', afterId: 'missing-anchor', litexml: '<p>Incorrect insertion</p>' },
          { action: 'modify', litexml: `<p id="${id}">Valid replacement</p>` },
        ],
      });
      expect(result.results.map((item) => item.success)).toEqual([false, false, false, true]);
      expect(result.successCount).toBe(1);
      expect(result.totalCount).toBe(4);
      for (const item of result.results.slice(0, 3)) expect(item.error).toMatch(/not found/u);
      const content = headless.export().markdown;
      expect(content).toContain('Valid replacement');
      expect(content).not.toContain('Incorrect');
      expect(after).toHaveBeenCalledTimes(1);
    } finally {
      headless.destroy();
    }
  });
  it('validates against earlier operations in the same batch', async () => {
    const headless = createSDKPublicEditorFixture();
    try {
      headless.hydrateMarkdown('First paragraph\n\nSecond paragraph');
      const ids = [
        ...(headless.export({ litexml: true }).litexml ?? '').matchAll(/<p id="([^"]+)"/gu),
      ].map((match) => match[1]);
      expect(ids).toHaveLength(2);
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const result = await runtime.modifyNodes({
        operations: [
          { action: 'remove', id: ids[0] },
          { action: 'insert', afterId: ids[0], litexml: '<p>Invalid stale anchor</p>' },
          { action: 'insert', afterId: ids[1], litexml: '<p>Valid appended paragraph</p>' },
        ],
      });
      expect(result.results.map((item) => item.success)).toEqual([true, false, true]);
      expect(result.successCount).toBe(2);
      expect(headless.export().markdown).toContain('Valid appended paragraph');
      expect(headless.export().markdown).not.toContain('Invalid stale anchor');
    } finally {
      headless.destroy();
    }
  });
  it('accepts a valid unchanged node without requiring a document-hash difference', async () => {
    const headless = createSDKPublicEditorFixture();
    try {
      headless.hydrateMarkdown('Unchanged paragraph');
      const id = headless.export({ litexml: true }).litexml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture paragraph requires its actual ID');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const result = await runtime.modifyNodes({
        operations: [{ action: 'modify', litexml: `<p id="${id}">Unchanged paragraph</p>` }],
      });
      expect(result.successCount).toBe(1);
      expect(headless.export().markdown).toContain('Unchanged paragraph');
    } finally {
      headless.destroy();
    }
  });
  it('resolves a nested inline target through the backend rather than root-only matching', async () => {
    const headless = createSDKPublicEditorFixture();
    try {
      headless.hydrateMarkdown('Nested text');
      const id = headless.export({ litexml: true }).litexml?.match(/<span id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture inline text requires its actual ID');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const result = await runtime.modifyNodes({
        operations: [{ action: 'modify', litexml: `<span id="${id}">Updated nested text</span>` }],
      });
      expect(result.successCount).toBe(1);
      expect(headless.export().markdown).toContain('Updated nested text');
    } finally {
      headless.destroy();
    }
  });
});
