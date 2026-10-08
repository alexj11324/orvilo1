import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceLambdaClient, lambdaClient } from '@/libs/trpc/client';
import { projectService } from '@/services/project';

vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: vi.fn(),
  lambdaClient: {
    project: {
      create: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
      list: { query: vi.fn() },
      update: { mutate: vi.fn() },
    },
  },
}));

describe('ProjectService', () => {
  it('exposes no Project orchestration policy client operations', () => {
    expect(projectService).not.toHaveProperty('getOrchestrationPolicy');
    expect(projectService).not.toHaveProperty('updateOrchestrationPolicy');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads every project page', async () => {
    type ProjectRows = Awaited<ReturnType<typeof lambdaClient.project.list.query>>['data'];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `project-${index}`,
    })) as ProjectRows;
    const secondPage = [{ id: 'project-100' }] as ProjectRows;
    vi.mocked(lambdaClient.project.list.query)
      .mockResolvedValueOnce({ data: firstPage, success: true })
      .mockResolvedValueOnce({ data: secondPage, success: true });

    const response = await projectService.listAll();

    expect(response.data).toHaveLength(101);
    expect(lambdaClient.project.list.query).toHaveBeenNthCalledWith(1, {
      limit: 100,
      offset: 0,
    });
    expect(lambdaClient.project.list.query).toHaveBeenNthCalledWith(2, {
      limit: 100,
      offset: 100,
    });
  });

  it('uses a workspace-pinned client when creating in a workspace', async () => {
    const mutate = vi.fn().mockResolvedValue({ data: { id: 'project-1' }, success: true });
    vi.mocked(createWorkspaceLambdaClient).mockReturnValue({
      project: { create: { mutate } },
    } as unknown as ReturnType<typeof createWorkspaceLambdaClient>);

    await projectService.create(
      { identifier: 'LOB', name: 'Launch', slug: 'launch' },
      'workspace-1',
    );

    expect(createWorkspaceLambdaClient).toHaveBeenCalledWith('workspace-1');
    expect(mutate).toHaveBeenCalledWith({ identifier: 'LOB', name: 'Launch', slug: 'launch' });
    expect(lambdaClient.project.create.mutate).not.toHaveBeenCalled();
  });

  it('pins participant writes to the selected workspace and propagates rejection', async () => {
    const binding = { agentId: 'agent-1', enabled: true };
    const add = vi.fn().mockResolvedValue({ data: binding, success: true });
    const remove = vi.fn().mockRejectedValue(new Error('Coordinator cannot be removed'));
    vi.mocked(createWorkspaceLambdaClient).mockReturnValue({
      project: { addAgent: { mutate: add }, removeAgent: { mutate: remove } },
    } as unknown as ReturnType<typeof createWorkspaceLambdaClient>);

    await expect(projectService.addAgent('project-1', 'agent-1', 'workspace-1')).resolves.toEqual({
      data: binding,
      success: true,
    });
    await expect(projectService.removeAgent('project-1', 'agent-1', 'workspace-1')).rejects.toThrow(
      'Coordinator cannot be removed',
    );
    expect(createWorkspaceLambdaClient).toHaveBeenNthCalledWith(1, 'workspace-1');
    expect(createWorkspaceLambdaClient).toHaveBeenNthCalledWith(2, 'workspace-1');
  });

  it('deletes a project by its internal id', async () => {
    vi.mocked(lambdaClient.project.delete.mutate).mockResolvedValue({
      data: { id: 'project-1' },
      message: 'Project deleted',
      success: true,
    } as Awaited<ReturnType<typeof lambdaClient.project.delete.mutate>>);

    await projectService.delete('project-1');

    expect(lambdaClient.project.delete.mutate).toHaveBeenCalledWith({ id: 'project-1' });
  });

  it('updates a project name by its internal id', async () => {
    vi.mocked(lambdaClient.project.update.mutate).mockResolvedValue({
      data: { id: 'project-1', name: 'Renamed' },
      message: 'Project updated',
      success: true,
    } as Awaited<ReturnType<typeof lambdaClient.project.update.mutate>>);

    await projectService.update('project-1', { name: 'Renamed' });

    expect(lambdaClient.project.update.mutate).toHaveBeenCalledWith({
      id: 'project-1',
      name: 'Renamed',
    });
  });
});
