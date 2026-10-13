import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileOrchestrationWorkflowTraceStore } from '../store/file-store';
import { loadOrchestrationWorkflowTrajectory } from '../store/loadTrajectory';
import type { OrchestrationWorkflowTrajectory } from '../types';
import { graph, node } from './fixtures';

const trajectory = (orchestrationWorkflowId: string): OrchestrationWorkflowTrajectory => ({
  advances: [],
  orchestrationWorkflowId,
  graphBaseline: graph({ nodes: [node('a')] }),
  startedAt: 0,
  title: 'Reproduce nanoGPT',
  totalAdvances: 0,
  totalTicks: 0,
  traceId: orchestrationWorkflowId,
});

describe('loadOrchestrationWorkflowTrajectory', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestration-workflow-trace-'));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { force: true, recursive: true });
  });

  it('upgrades legacy local trace data without rewriting user-authored goal text', async () => {
    const legacy = {
      ...trajectory('retained-id'),
      goalId: 'retained-id',
      orchestrationWorkflowId: undefined,
      title: 'My goal is delivery',
      graphBaseline: {
        ...graph(),
        orchestrationWorkflow: undefined,
        goal: graph().orchestrationWorkflow,
      },
      advances: [
        {
          ticks: [
            {
              branch: 'goal_paused',
              effects: [{ type: 'goal_status' }],
              candidateTasks: [{ error: 'Goal Task operation lease expired.' }],
              frontierTask: { error: 'Goal Task operation lease expired.' },
              graphDelta: { goal: { status: 'paused' } },
            },
          ],
        },
      ],
    };
    const oldDir = path.join(rootDir, '.goal-tracing');
    await fs.mkdir(oldDir);
    await fs.writeFile(path.join(oldDir, 'retained-id.json'), JSON.stringify(legacy));
    const loaded = await loadOrchestrationWorkflowTrajectory('retained-id', { rootDir });
    expect(loaded?.orchestrationWorkflowId).toBe('retained-id');
    expect(loaded?.title).toBe('My goal is delivery');
    expect(loaded?.graphBaseline.orchestrationWorkflow.id).toBeTruthy();
    expect(loaded?.advances[0].ticks[0]).toMatchObject({
      branch: 'orchestration_workflow_paused',
      effects: [{ type: 'orchestration_workflow_status' }],
      candidateTasks: [{ error: 'Orchestration workflow Task operation lease expired.' }],
      frontierTask: { error: 'Orchestration workflow Task operation lease expired.' },
      graphDelta: { orchestrationWorkflow: { status: 'paused' } },
    });
    const stored = JSON.parse(
      await fs.readFile(
        path.join(rootDir, '.orchestration-workflow-tracing', 'retained-id.json'),
        'utf8',
      ),
    );
    expect(stored).not.toHaveProperty('goalId');
    expect(stored.graphBaseline).not.toHaveProperty('goal');
    expect(await loadOrchestrationWorkflowTrajectory('retained-id', { rootDir })).toEqual(loaded);
  });

  it('reads a local trajectory without asking the server', async () => {
    await new FileOrchestrationWorkflowTraceStore(rootDir).save(
      trajectory('orchestration_workflow_1'),
    );
    const resolveDownloadUrl = vi.fn();

    const loaded = await loadOrchestrationWorkflowTrajectory('orchestration_workflow_1', {
      allowDownload: true,
      resolveDownloadUrl,
      rootDir,
    });

    expect(loaded?.orchestrationWorkflowId).toBe('orchestration_workflow_1');
    expect(resolveDownloadUrl).not.toHaveBeenCalled();
  });

  it('serves an in-flight orchestration workflow from its partial', async () => {
    await new FileOrchestrationWorkflowTraceStore(rootDir).savePartial('orchestration_workflow_2', {
      advances: [],
      orchestrationWorkflowId: 'orchestration_workflow_2',
      startedAt: 5,
      title: 'Still running',
    });

    const loaded = await loadOrchestrationWorkflowTrajectory('orchestration_workflow_2', {
      rootDir,
    });

    expect(loaded).toMatchObject({
      orchestrationWorkflowId: 'orchestration_workflow_2',
      title: 'Still running',
    });
  });

  it('does not reach the network unless downloading is allowed', async () => {
    const resolveDownloadUrl = vi.fn();

    expect(
      await loadOrchestrationWorkflowTrajectory('orchestration_workflow_missing', {
        resolveDownloadUrl,
        rootDir,
      }),
    ).toBeUndefined();
    expect(resolveDownloadUrl).not.toHaveBeenCalled();
  });

  it('gives up quietly when the server has nothing to sign', async () => {
    const resolveDownloadUrl = vi.fn().mockResolvedValue(null);

    const loaded = await loadOrchestrationWorkflowTrajectory('orchestration_workflow_missing', {
      allowDownload: true,
      resolveDownloadUrl,
      rootDir,
    });

    expect(loaded).toBeUndefined();
    expect(resolveDownloadUrl).toHaveBeenCalledWith('orchestration_workflow_missing');
  });

  it('re-fetches an unfinished orchestration workflow instead of serving a stale cached copy', async () => {
    // A running orchestration workflow is a moving object; a cache hit would pin the reader to
    // whatever it looked like the first time it was inspected.
    const cacheDir = path.join(rootDir, '.orchestration-workflow-tracing', '_remote');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'orchestration_workflow_running.json'),
      JSON.stringify({ ...trajectory('orchestration_workflow_running'), advances: [] }),
      'utf8',
    );
    const resolveDownloadUrl = vi.fn().mockResolvedValue(null);

    await loadOrchestrationWorkflowTrajectory('orchestration_workflow_running', {
      allowDownload: true,
      resolveDownloadUrl,
      rootDir,
    });

    expect(resolveDownloadUrl).toHaveBeenCalledWith('orchestration_workflow_running');
  });

  it('serves a finished orchestration workflow from cache without asking the server again', async () => {
    const cacheDir = path.join(rootDir, '.orchestration-workflow-tracing', '_remote');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'orchestration_workflow_done.json'),
      JSON.stringify({
        ...trajectory('orchestration_workflow_done'),
        completionReason: 'achieved',
      }),
      'utf8',
    );
    const resolveDownloadUrl = vi.fn();

    const loaded = await loadOrchestrationWorkflowTrajectory('orchestration_workflow_done', {
      allowDownload: true,
      resolveDownloadUrl,
      rootDir,
    });

    expect(loaded?.completionReason).toBe('achieved');
    expect(resolveDownloadUrl).not.toHaveBeenCalled();
  });

  it('reads a trajectory straight off a json path', async () => {
    const filePath = path.join(rootDir, 'exported.json');
    await fs.writeFile(filePath, JSON.stringify(trajectory('orchestration_workflow_3')), 'utf8');

    expect((await loadOrchestrationWorkflowTrajectory(filePath))?.orchestrationWorkflowId).toBe(
      'orchestration_workflow_3',
    );
  });
});
