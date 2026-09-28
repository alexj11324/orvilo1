import type { LinearIssueSnapshot, LinearSyncConflict, TaskItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  buildLinearConflictResolution,
  mergeLinearIssueSnapshots,
  taskPatchForResolvedLinearSnapshot,
} from './merge';

const issue = (patch: Partial<LinearIssueSnapshot> = {}): LinearIssueSnapshot => ({
  description: 'base description',
  id: 'issue-1',
  identifier: 'ENG-1',
  priority: 1,
  projectId: 'linear-project-1',
  stateId: 'state-1',
  title: 'Base title',
  updatedAt: '2026-09-17T10:00:00.000Z',
  ...patch,
});

describe('Linear three-way conflict resolution', () => {
  it('keeps non-conflicting remote changes while preserving both values for a conflict', () => {
    const base = issue();
    const local = issue({ title: 'Local title' });
    const remote = issue({ description: 'Remote description', title: 'Remote title' });

    expect(mergeLinearIssueSnapshots({ base, local, remote })).toMatchObject({
      conflicts: {
        fields: ['title'],
        local: { title: 'Local title' },
        remote: { title: 'Remote title' },
      },
      merged: { description: 'Remote description', title: 'Local title' },
    });
  });

  it('re-bases keep-local onto the current remote snapshot and queues only the chosen delta', () => {
    const base = issue();
    const local = issue({ title: 'Local title' });
    const remote = issue({ description: 'Remote description', title: 'Remote title' });
    const conflict: LinearSyncConflict = {
      base: { title: base.title },
      detectedAt: '2026-09-17T10:01:00.000Z',
      fields: ['title'],
      local: { title: local.title },
      remote: { title: remote.title },
    };

    expect(
      buildLinearConflictResolution({ base, conflict, local, remote, strategy: 'keep_local' }),
    ).toEqual({
      outboundPatch: { title: 'Local title' },
      resolved: expect.objectContaining({
        description: 'Remote description',
        title: 'Local title',
      }),
    });
  });

  it('requires an explicit source for every field in a merge resolution', () => {
    const base = issue();
    const local = issue({ description: 'Local body', title: 'Local title' });
    const remote = issue({ description: 'Remote body', title: 'Remote title' });
    const conflict: LinearSyncConflict = {
      base: { description: base.description, title: base.title },
      detectedAt: '2026-09-17T10:01:00.000Z',
      fields: ['description', 'title'],
      local: { description: local.description, title: local.title },
      remote: { description: remote.description, title: remote.title },
    };

    expect(() =>
      buildLinearConflictResolution({
        base,
        conflict,
        fieldSources: { title: 'local' },
        local,
        remote,
        strategy: 'merge',
      }),
    ).toThrow('A merge source is required for description');

    expect(
      buildLinearConflictResolution({
        base,
        conflict,
        fieldSources: { description: 'linear', title: 'local' },
        local,
        remote,
        strategy: 'merge',
      }),
    ).toMatchObject({
      outboundPatch: { title: 'Local title' },
      resolved: { description: 'Remote body', title: 'Local title' },
    });
  });

  it('applies a full remote body through the Task command without clearing an unmapped assignee', () => {
    const task = {
      assigneeUserId: 'workspace-user-1',
      identifier: 'TASK-1',
      instruction: 'Old body',
      name: 'Old title',
      priority: 1,
      status: 'pending',
      workflowCategory: 'backlog',
    } as TaskItem;
    const longBody = 'x'.repeat(300);
    const local = issue({ assigneeId: 'linear-user-1', description: 'Old body' });
    const resolved = issue({ assigneeId: 'unmapped-user', description: longBody });

    expect(taskPatchForResolvedLinearSnapshot(task, local, resolved, {})).toEqual({
      description: longBody.slice(0, 255),
      editorData: null,
      instruction: longBody,
    });
  });
});
