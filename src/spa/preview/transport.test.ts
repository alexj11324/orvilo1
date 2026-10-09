import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PREVIEW_STORAGE_KEY } from './fixtures';
import {
  createPreviewBackend,
  installPreviewTransport,
  PreviewUnsupportedError,
} from './transport';

describe('isolated repository preview data', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('loads the real workspace and list response shapes', () => {
    const backend = createPreviewBackend();
    expect(backend.execute('workspace.list')).toHaveLength(1);
    expect(backend.execute('task.list')).toMatchObject({ success: true, total: 9 });
    expect(backend.execute('providerBinding.list')).toEqual({ success: true, data: [] });
  });
  it('persists issue edits and preserves dates across reloads', () => {
    const backend = createPreviewBackend(localStorage);
    const issue = backend.getDatabase().tasks[0];
    backend.execute(
      'task.update',
      { id: issue.id, name: 'Updated locally', expectedDomainRevision: 1 },
      true,
    );
    const restored = createPreviewBackend(localStorage).getDatabase().tasks[0];
    expect(restored.name).toBe('Updated locally');
    expect(restored.domainRevision).toBe(2);
    expect(restored.updatedAt).toBeInstanceOf(Date);
  });
  it('rejects stale edits rather than overwriting a newer revision', () => {
    const backend = createPreviewBackend();
    expect(() =>
      backend.execute('task.update', { id: 'preview-task-1', expectedDomainRevision: 0 }, true),
    ).toThrow('Refresh');
  });
  it('creates distinct local issue identifiers', () => {
    const backend = createPreviewBackend();
    backend.execute('task.create', { name: 'First' }, true);
    backend.execute('task.create', { name: 'Second' }, true);
    expect(new Set(backend.getDatabase().tasks.map((t) => t.identifier)).size).toBe(11);
  });
  it('fails closed for execution and unimplemented mutations', () => {
    const backend = createPreviewBackend();
    expect(() => backend.execute('task.run', {}, true)).toThrow(PreviewUnsupportedError);
    expect(() => backend.execute('device.delete', {}, true)).toThrow(PreviewUnsupportedError);
  });
  it.each(['agent', 'member', 'priority'])(
    'honors %s board grouping and column pagination',
    (groupBy) => {
      const backend = createPreviewBackend();
      const groups = (
        backend.execute('task.groupList', { groupBy, groupLimits: { 'priority:1': 1 } }) as any
      ).data;
      expect(groups.map((g: any) => g.key)).not.toContain('backlog');
      expect(groups.reduce((n: number, g: any) => n + g.total, 0)).toBe(9);
      for (const group of groups)
        for (const task of group.tasks) {
          const expected =
            groupBy === 'priority'
              ? `priority:${task.priority ?? 0}`
              : groupBy === 'agent'
                ? `assignee:${task.assigneeAgentId ?? 'unassigned'}`
                : `member:${task.assigneeUserId ?? 'unassigned'}`;
          expect(group.key).toBe(expected);
        }
      if (groupBy === 'priority')
        expect(groups.find((g: any) => g.key === 'priority:1')).toMatchObject({
          total: 3,
          hasMore: true,
          tasks: [expect.anything()],
        });
    },
  );
  it('does not present assigned tasks as delegated and scopes created tasks to their author', () => {
    const backend = createPreviewBackend();
    expect(backend.execute('task.list', { scope: 'delegated' })).toMatchObject({
      total: 0,
      data: [],
    });
    backend.getDatabase().tasks[0].createdByUserId = 'other-user';
    expect(backend.execute('task.list', { scope: 'created' })).toMatchObject({ total: 8 });
    expect(backend.execute('task.list', { scope: 'assigned' })).toMatchObject({ total: 3 });
  });
  it('returns persisted subtasks and their descendant tree after reload', () => {
    const backend = createPreviewBackend(localStorage);
    const parent = backend.getDatabase().tasks[0];
    const child = (
      backend.execute(
        'task.create',
        { name: 'Child', parentTaskId: parent.identifier },
        true,
      ) as any
    ).data;
    const grandchild = (
      backend.execute(
        'task.create',
        { name: 'Grandchild', parentTaskId: child.identifier },
        true,
      ) as any
    ).data;
    const restored = createPreviewBackend(localStorage);
    expect(
      (restored.execute('task.detail', { id: parent.identifier }) as any).data.subtasks.map(
        (t: any) => t.id,
      ),
    ).toEqual([child.id]);
    expect(
      (restored.execute('task.getSubtasks', { id: parent.id }) as any).data.map((t: any) => t.id),
    ).toEqual([child.id]);
    expect(
      (restored.execute('task.getTaskTree', { id: parent.id }) as any).data.map((t: any) => t.id),
    ).toEqual([parent.id, child.id, grandchild.id]);
  });
  it('paginates topics and reports the filtered agent total', () => {
    const backend = createPreviewBackend();
    expect(backend.execute('topic.getTopics', { agentId: 'preview-agent-b' })).toEqual({
      items: [],
      total: 0,
    });
    const agentId = backend.getDatabase().topics[0].agentId;
    backend.execute('topic.createTopic', { agentId, title: 'Second' }, true);
    expect(backend.execute('topic.getTopics', { agentId, current: 2, pageSize: 1 })).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ title: 'Second' })],
    });
  });
  it('blocks same-origin backend prefixes while preserving static asset fetches', async () => {
    const original = vi.fn().mockResolvedValue(new Response('static'));
    vi.stubGlobal('window', { fetch: original, localStorage });
    installPreviewTransport();
    for (const path of [
      '/webapi/chat',
      '/webapi/topic/comment/events',
      '/oidc/token',
      '/api/unknown',
    ]) {
      const response = await window.fetch(path);
      expect(response.status, path).toBe(501);
    }
    expect(original).not.toHaveBeenCalled();
    await window.fetch('/assets/app.js');
    expect(original).toHaveBeenCalledTimes(1);
  });
  it('recovers malformed fixtures and resets only its own storage key', () => {
    localStorage.setItem(PREVIEW_STORAGE_KEY, 'broken');
    localStorage.setItem('unrelated', 'keep');
    const backend = createPreviewBackend(localStorage);
    expect(backend.getDatabase().tasks).toHaveLength(9);
    backend.reset();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
