// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentDocumentsRuntime } from './agentDocuments';

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  emitOutcome: vi.fn(),
  getDocumentSnapshotById: vi.fn(),
  modifyDocumentNodesById: vi.fn(),
  pinDocument: vi.fn(),
}));

vi.mock('@/server/services/agentDocuments', () => ({
  AgentDocumentsService: vi.fn().mockImplementation(function () {
    return {
      createDocument: mocks.createDocument,
      getDocumentSnapshotById: mocks.getDocumentSnapshotById,
      listDocuments,
      modifyDocumentNodesById: mocks.modifyDocumentNodesById,
    };
  }),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn().mockImplementation(function () {
    return { pinDocument: mocks.pinDocument };
  }),
}));

vi.mock('@/server/services/agentDocuments/toolOutcome', () => ({
  emitAgentDocumentToolOutcomeSafely: mocks.emitOutcome,
}));

vi.mock('@/server/services/agentDocuments/documentWork', () => ({
  createDocumentWorkRegistrar: () => ({
    buildRegisteredDocumentUrl: () => 'https://app.example.test/doc',
  }),
}));

const listDocuments = vi.fn();

describe('agentDocumentsRuntime', () => {
  describe('listDocuments', () => {
    it('should preserve document filenames in runtime output', async () => {
      listDocuments.mockResolvedValue([
        { filename: 'rules.md', id: 'doc-1', title: 'Rules' },
        { filename: 'notes.txt', id: 'doc-2', title: 'Notes' },
      ]);

      const runtime = agentDocumentsRuntime.factory({
        serverDB: {} as never,
        toolManifestMap: {},
        userId: 'user-1',
      });
      const result = await runtime.listDocuments({}, { agentId: 'agent-1' });

      // The agent runtime opts into seeing the archived `.tool-results`.
      expect(listDocuments).toHaveBeenCalledWith('agent-1', 'all', {
        includeArchivedToolResults: true,
      });
      expect(result).toEqual({
        content: JSON.stringify([
          { filename: 'rules.md', id: 'doc-1', title: 'Rules' },
          { filename: 'notes.txt', id: 'doc-2', title: 'Notes' },
        ]),
        state: {
          documents: [
            { filename: 'rules.md', id: 'doc-1', title: 'Rules' },
            { filename: 'notes.txt', id: 'doc-2', title: 'Notes' },
          ],
        },
        success: true,
      });
    });
  });
});

/**
 * The runtime attaches a produced document to the owning task. It used to do so
 * with a `pinToTask(...)` wrapper around `withDocumentOutcome(...)`, which meant
 * the outcome was emitted — and could say `succeeded` — before the attach had
 * run. A failed attach then reached the tool call as a thrown error: the run's
 * record said the document was created, the task never received it, and the
 * agent saw a failure. These cover the two halves of the invariant.
 */
describe('agentDocumentsRuntime · task attachment', () => {
  const created = { documentId: 'doc-9', id: 'agent-doc-1', title: 'Notes' };

  // `workspaceId` is threaded so the runtime skips its `tasks` lookup fallback,
  // which would otherwise need a real database.
  const runtimeWithTask = () =>
    agentDocumentsRuntime.factory({
      serverDB: {} as never,
      taskId: 'task-1',
      toolManifestMap: {},
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

  beforeEach(() => {
    mocks.emitOutcome.mockReset().mockResolvedValue(undefined);
    mocks.pinDocument.mockReset().mockResolvedValue(undefined);
    mocks.createDocument.mockReset().mockResolvedValue(created);
    mocks.getDocumentSnapshotById.mockReset().mockResolvedValue(created);
    mocks.modifyDocumentNodesById.mockReset().mockResolvedValue(created);
  });

  it('attaches a created document before recording the outcome', async () => {
    await runtimeWithTask().createDocument(
      { content: 'body', title: 'Notes' },
      { agentId: 'agt-1' },
    );

    expect(mocks.pinDocument).toHaveBeenCalledWith('task-1', 'doc-9', 'agent');
    // Recorded with the attached document's id and the plain summary: nothing to
    // report, so the outcome reads exactly as it did before.
    expect(mocks.emitOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ agentDocumentId: 'agent-doc-1', status: 'succeeded' }),
    );
    const [emitted] = mocks.emitOutcome.mock.calls.at(-1)!;
    expect(emitted.summary).not.toContain('attaching it to the task failed');
  });

  // The regression: a failed attach must not turn a document that exists into a
  // thrown failure, and the outcome must not claim a clean success either.
  it('reports a failed attach instead of failing the run', async () => {
    mocks.pinDocument.mockRejectedValue(new Error('pin exploded'));

    await expect(
      runtimeWithTask().createDocument({ content: 'body', title: 'Notes' }, { agentId: 'agt-1' }),
    ).resolves.toMatchObject({ success: true });

    expect(mocks.emitOutcome).toHaveBeenCalledTimes(1);
    const [emitted] = mocks.emitOutcome.mock.calls[0];
    expect(emitted.status).toBe('succeeded');
    expect(emitted.summary).toContain('pin exploded');
    // The document is still recorded, so the artifacts UI can re-attach it.
    expect(emitted.agentDocumentId).toBe('agent-doc-1');
  });

  // `pinToTask` used to wrap only the three creating methods. Attaching on a
  // modification or removal would leave the task pointing at a document it no
  // longer relates to — and in the removal case, at one that is gone.
  it('does not attach when the relation is not a creation', async () => {
    // A non-empty operation list: the runtime returns early on an empty one, and
    // an early return would make this pass without exercising the attach path.
    await runtimeWithTask().modifyNodes(
      { agentId: 'agt-1', id: 'agent-doc-1', operations: [{ content: 'edited', type: 'replace' }] },
      { agentId: 'agt-1' },
    );

    expect(mocks.modifyDocumentNodesById).toHaveBeenCalled();
    expect(mocks.pinDocument).not.toHaveBeenCalled();
    expect(mocks.emitOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('does not attach when the run has no task', async () => {
    const runtime = agentDocumentsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    await runtime.createDocument({ content: 'body', title: 'Notes' }, { agentId: 'agt-1' });

    expect(mocks.pinDocument).not.toHaveBeenCalled();
    expect(mocks.emitOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ agentDocumentId: 'agent-doc-1', status: 'succeeded' }),
    );
  });
});
