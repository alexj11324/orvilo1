import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileOrchestrationWorkflowTraceStore } from '../store/file-store';
import type { OrchestrationWorkflowTrajectory } from '../types';
import { graph, node } from './fixtures';

const trajectory = (
  orchestrationWorkflowId: string,
  title: string,
): OrchestrationWorkflowTrajectory => ({
  advances: [],
  orchestrationWorkflowId,
  graphBaseline: graph({ nodes: [node('a')] }),
  startedAt: 0,
  title,
  totalAdvances: 0,
  totalTicks: 0,
  traceId: orchestrationWorkflowId,
});

describe('FileOrchestrationWorkflowTraceStore.list', () => {
  let rootDir: string;
  let store: FileOrchestrationWorkflowTraceStore;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestration-workflow-store-'));
    store = new FileOrchestrationWorkflowTraceStore(rootDir);
  });

  afterEach(async () => {
    await fs.rm(rootDir, { force: true, recursive: true });
  });

  it('lists orchestration workflows that are still running, not only finished ones', async () => {
    // A long-horizon orchestration workflow is a partial for nearly all of its life, so a listing
    // that showed only finalized objects would report an empty directory on a
    // machine that is actively running orchestration workflows.
    await store.savePartial('orchestration_workflow_running', {
      advances: [],
      orchestrationWorkflowId: 'orchestration_workflow_running',
      startedAt: 5,
      title: 'Still going',
    });

    expect(await store.list()).toMatchObject([
      {
        completionReason: undefined,
        orchestrationWorkflowId: 'orchestration_workflow_running',
        title: 'Still going',
      },
    ]);
  });

  it('shows an orchestration workflow once when a stale partial outlived its finalized object', async () => {
    await store.savePartial('orchestration_workflow_1', {
      advances: [],
      orchestrationWorkflowId: 'orchestration_workflow_1',
      title: 'Partial copy',
    });
    await store.save({
      ...trajectory('orchestration_workflow_1', 'Finalized copy'),
      completionReason: 'achieved',
    });

    const listed = await store.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ completionReason: 'achieved', title: 'Finalized copy' });
  });

  it('applies the limit across both kinds', async () => {
    await store.save(trajectory('orchestration_workflow_done', 'Done'));
    await store.savePartial('orchestration_workflow_open', {
      advances: [],
      orchestrationWorkflowId: 'orchestration_workflow_open',
      title: 'Open',
    });

    expect(await store.list({ limit: 1 })).toHaveLength(1);
    expect(await store.list()).toHaveLength(2);
  });
});
