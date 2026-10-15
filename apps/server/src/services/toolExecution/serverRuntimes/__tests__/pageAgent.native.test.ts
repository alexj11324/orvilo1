// @vitest-environment node
import type { PageAgentExecutionRuntime } from '@orvilo/builtin-tool-page-agent/executionRuntime';
import {
  createHeadlessEditor,
  DiffAction,
  LITEXML_DIFFNODE_ALL_COMMAND,
} from '@orvilo/editor-runtime/headless';
import { isRecord } from '@orvilo/utils/object';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DatabaseSchema from '@/database/schemas';
import type { UpdateDocumentParams } from '@/server/services/document/types';

import { pageAgentRuntime } from '../pageAgent';

type StoredPage = { content: string; editorData: Record<string, unknown> | null; title: string };
const boundary = vi.hoisted(() => ({
  findById: vi.fn<(id: string) => Promise<StoredPage>>(),
  updateDocument: vi.fn<(id: string, params: UpdateDocumentParams) => Promise<void>>(),
  lockEntries: [] as string[],
}));

// Only persistence and its lock boundary are replaced. The real factory,
// execution envelope, Runtime, native commands, codecs and Lexical run intact.
vi.mock('@/database/models/document', () => ({
  DocumentModel: class {
    findById = boundary.findById;
  },
}));
vi.mock('@/server/services/document', () => ({
  DocumentService: class {
    updateDocument = boundary.updateDocument;
    async runWithDocumentLock<T>(id: string, run: (owner?: string) => Promise<T>): Promise<T> {
      boundary.lockEntries.push(id);
      return run('integration-test-lock');
    }
  },
}));

const ctx = { documentId: 'page-integration', operationId: 'op-native', userId: 'user-test' };
let stored: StoredPage;
const stateOf = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error('Actual runtime must return a state record');
  return value;
};
const runtimeFixture = (): PageAgentExecutionRuntime => {
  // A genuine typed Drizzle mock handle; no connection, credentials or DB writes.
  // Mocked leaf constructors never touch it.
  const serverDB = drizzle.mock<typeof DatabaseSchema>();
  return pageAgentRuntime.factory({ serverDB, toolManifestMap: {}, userId: ctx.userId });
};
const realParagraphId = async (runtime: PageAgentExecutionRuntime): Promise<string> => {
  const before = await runtime.getPageContent({ format: 'both' }, ctx);
  expect(before.success).toBe(true);
  const xml = stateOf(before.state).xml;
  if (typeof xml !== 'string') throw new Error('Real XML export required');
  const id = xml.match(/<p id="([^"]+)"/u)?.[1];
  if (!id) throw new Error('Real persisted paragraph ID required');
  // Persist the exact read snapshot so the next invocation hydrates stable IDs.
  const data = stateOf(before.state).documentEditorData;
  if (!isRecord(data)) throw new Error('Real serialized snapshot required');
  const markdown = stateOf(before.state).documentContent;
  if (typeof markdown !== 'string') throw new Error('Real markdown export required');
  stored = { ...stored, content: markdown, editorData: structuredClone(data) };
  return id;
};

beforeEach(() => {
  vi.clearAllMocks();
  boundary.lockEntries.length = 0;
  stored = { content: 'Original server paragraph', editorData: null, title: 'Integration page' };
  boundary.findById.mockImplementation(async (id) => {
    expect(id).toBe(ctx.documentId);
    return structuredClone(stored);
  });
  boundary.updateDocument.mockImplementation(async (id, params) => {
    expect(id).toBe(ctx.documentId);
    expect(params.lockOwnerId).toBe('integration-test-lock');
    stored = {
      content: params.content ?? stored.content,
      editorData: params.editorData ? structuredClone(params.editorData) : stored.editorData,
      title: params.title ?? stored.title,
    };
  });
});

describe('Page Agent server factory with real owned headless backend', () => {
  it('persists actual mixed mutation results and rehydrates the pending proposal', async () => {
    const runtime = runtimeFixture();
    const id = await realParagraphId(runtime);
    const original = structuredClone(stored.editorData);
    const result = await runtime.modifyNodes(
      {
        operations: [
          { action: 'remove', id: 'missing-server-node' },
          { action: 'modify', litexml: `<p id="${id}">Updated server paragraph</p>` },
        ],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    const state = stateOf(result.state);
    expect(state).toMatchObject({ documentId: ctx.documentId, successCount: 1, totalCount: 2 });
    expect(state.results).toEqual([
      expect.objectContaining({ action: 'remove', success: false }),
      expect.objectContaining({ action: 'modify', success: true }),
    ]);
    expect(state.invariantViolation).toBeUndefined();
    expect(boundary.updateDocument).toHaveBeenCalledTimes(1);
    expect(boundary.updateDocument.mock.calls[0][1].saveSource).toBe('llm_call');
    expect(boundary.lockEntries).toEqual([ctx.documentId]);
    expect(stored.editorData).not.toEqual(original);
    expect(stored.content).toContain('Updated server paragraph');
    expect(state.documentContent).toBe(stored.content);
    expect(state.documentEditorData).toEqual(stored.editorData);
    const persisted = JSON.stringify(stored.editorData);
    expect(persisted).toContain('"type":"diff"');
    expect(persisted).toContain('Original server paragraph');
    expect(persisted).toContain('Updated server paragraph');

    // A separate invocation must reconstruct its editor from the saved row.
    const read = await runtime.getPageContent({ format: 'both' }, ctx);
    expect(read.success).toBe(true);
    const reread = stateOf(read.state);
    expect(reread.documentEditorData).toEqual(stored.editorData);
    expect(reread.documentContent).toBe(stored.content);
    expect(reread.markdown).toContain('Updated server paragraph');
    expect(boundary.updateDocument).toHaveBeenCalledTimes(1);
    expect(boundary.lockEntries).toEqual([ctx.documentId]);

    // Stored proposal retains both review outcomes through real rehydration.
    for (const action of [DiffAction.Accept, DiffAction.Reject]) {
      const editor = createHeadlessEditor();
      try {
        const data = stored.editorData;
        if (!data) throw new Error('Persisted editorData required');
        editor.hydrateEditorData(JSON.stringify(data), { keepId: true });
        editor.kernel.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, { action });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const reviewed = JSON.stringify(editor.export().editorData);
        expect(reviewed).not.toContain('"type":"diff"');
        expect(reviewed).toContain(
          action === DiffAction.Accept ? 'Updated server paragraph' : 'Original server paragraph',
        );
        expect(reviewed).not.toContain(
          action === DiffAction.Accept ? 'Original server paragraph' : 'Updated server paragraph',
        );
      } finally {
        editor.destroy();
      }
    }
  });

  it('does not count a missing target as a successful mutation', async () => {
    const runtime = runtimeFixture();
    await realParagraphId(runtime);
    const before = structuredClone(stored);
    const result = await runtime.modifyNodes(
      { operations: [{ action: 'remove', id: 'missing-only-target' }] },
      ctx,
    );
    const state = stateOf(result.state);
    // The envelope means the API completed; per-operation outcomes prove whether
    // anything changed. Do not equate envelope success with a successful edit.
    expect(result.success).toBe(true);
    expect(state).toMatchObject({ successCount: 0, totalCount: 1 });
    expect(state.results).toEqual([expect.objectContaining({ action: 'remove', success: false })]);
    expect(state.invariantViolation).toBeUndefined();
    expect(stored).toEqual(before);
    expect(state.documentEditorData).toEqual(before.editorData);
    expect(state.documentContent).toBe(before.content);
  });
});
