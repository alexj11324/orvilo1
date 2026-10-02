// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAegisArtifactWorks } from '../aegisWorkRegistration';

const { findFileVersionByToolCall, registerFile, createFileRecord, uploadBuffer } = vi.hoisted(
  () => ({
    createFileRecord: vi.fn(async () => ({ fileId: 'file-1', url: '/f/file-1' })),
    findFileVersionByToolCall: vi.fn(async () => undefined),
    registerFile: vi.fn(async () => ({ currentVersionId: 'v1', id: 'work-1' })),
    uploadBuffer: vi.fn(async () => ({ key: 'k' })),
  }),
);

const workModel = { findFileVersionByToolCall, registerFile } as never;
const fileService = { createFileRecord, uploadBuffer } as never;

const baseParams = {
  agentId: 'agent-1',
  cumulativeCost: 1,
  cumulativeUsage: null,
  fileService,
  messageId: 'msg-1',
  operationId: 'op-1',
  threadId: 'thread-1',
  topicId: 'topic-1',
  userId: 'user-1',
  workModel,
};

const metadataWith = (artifacts: { content: string; path: string }[]) => ({
  aegis: { artifacts, enabled: true },
});

describe('registerAegisArtifactWorks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no-ops without the opt-in marker', async () => {
    for (const metadata of [undefined, null, {}, { aegis: {} }, { aegis: { enabled: false } }]) {
      const outcome = await registerAegisArtifactWorks({ ...baseParams, metadata });
      expect(outcome).toEqual({ attempted: 0, failed: 0, registered: 0 });
      expect(uploadBuffer).not.toHaveBeenCalled();
    }
  });

  it('no-ops when enabled but artifact-free (opted in, produced nothing)', async () => {
    const outcome = await registerAegisArtifactWorks({
      ...baseParams,
      metadata: metadataWith([]),
    });
    expect(outcome).toEqual({ attempted: 0, failed: 0, registered: 0 });
    expect(registerFile).not.toHaveBeenCalled();
  });

  it('uploads each artifact and registers a file Work per (operation, path)', async () => {
    const outcome = await registerAegisArtifactWorks({
      ...baseParams,
      metadata: metadataWith([
        { content: '{"confidence":"A"}', path: '.aegis/closeout.json' },
        { content: '{"drift":[]}', path: '.aegis/drift.json' },
      ]),
    });

    expect(outcome).toEqual({ attempted: 2, failed: 0, registered: 2 });
    expect(uploadBuffer).toHaveBeenCalledTimes(2);
    expect(registerFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '.aegis/closeout.json',
        rootOperationId: 'op-1',
        title: 'closeout.json',
        toolCallId: 'aegis:op-1:.aegis/closeout.json',
        toolIdentifier: 'aegis',
        topicId: 'topic-1',
        userId: 'user-1',
      }),
    );
    expect(registerFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '.aegis/drift.json' }),
    );
    // The record's storage URL carries the deduped key, not the agent-facing path.
    expect(createFileRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'closeout.json', fileType: 'application/json' }),
    );
  });

  it('skips re-registering an artifact whose version already exists (retry)', async () => {
    findFileVersionByToolCall.mockResolvedValueOnce({ id: 'wv-1' } as never);
    const outcome = await registerAegisArtifactWorks({
      ...baseParams,
      metadata: metadataWith([{ content: '{}', path: '.aegis/closeout.json' }]),
    });
    expect(outcome).toEqual({ attempted: 1, failed: 0, registered: 1 });
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(registerFile).not.toHaveBeenCalled();
  });

  it('counts a per-artifact failure without aborting the batch', async () => {
    uploadBuffer.mockRejectedValueOnce(new Error('storage down'));
    const outcome = await registerAegisArtifactWorks({
      ...baseParams,
      metadata: metadataWith([
        { content: '{}', path: '.aegis/closeout.json' },
        { content: '{}', path: '.aegis/drift.json' },
      ]),
    });
    expect(outcome).toEqual({ attempted: 2, failed: 1, registered: 1 });
  });
});
