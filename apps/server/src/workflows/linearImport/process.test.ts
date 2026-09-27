import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processLinearImportWorkflow } from './process';

const state = vi.hoisted(() => ({
  activeWorkflowRunId: 'linear-import-active-dispatch',
  cursor: null as string | null,
  status: 'queued',
  imported: [] as string[],
  pages: 0,
  scheduledContexts: [] as Array<{ requestPayload: object; workflowRunId: string }>,
  triggerHatchetWorkflow: vi.fn(),
  listTeams: vi.fn(),
  listTeamIssues: vi.fn(),
}));

vi.mock('@/database/server', () => ({
  getServerDB: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            { organizationId: 'org-1', organizationName: 'Org', status: 'active' },
          ],
        }),
      }),
    }),
  }),
}));
vi.mock('@/database/models/linearImport', () => ({
  LinearImportModel: class {
    async claim() {
      if (state.status !== 'queued') return null;
      state.status = 'running';
      return {
        job: {
          id: 'job-1',
          installationId: '00000000-0000-4000-8000-000000000099',
          teamId: 'team-1',
          projectId: 'project-1',
          cursor: state.cursor,
          stateMappings: [{ linearStateId: 'state-1', workflowCategory: 'todo' }],
        },
        owner: 'owner-1',
      };
    }
    async recordIssue(input: { issue: { id: string } }) {
      state.imported.push(input.issue.id);
      return 'imported';
    }
    async completePage(input: { nextCursor: string | null; hasNextPage: boolean }) {
      state.cursor = input.nextCursor;
      state.pages += 1;
      state.status = input.hasNextPage ? 'queued' : 'completed';
      return { status: state.status, pagesProcessed: state.pages };
    }
    async fail() {
      state.status = 'failed';
    }
    async failQueued() {
      if (state.status === 'queued') state.status = 'failed';
    }
  },
}));
vi.mock('@/server/services/linearSync/provider', () => ({
  createLinearGraphqlIssueProvider: () => ({
    listTeams: state.listTeams,
    listTeamIssues: state.listTeamIssues,
  }),
}));
vi.mock('@/server/services/hatchet/workflows', () => ({
  triggerHatchetWorkflow: state.triggerHatchetWorkflow,
}));

const requestPayload = {
  workspaceId: 'workspace-1',
  jobId: '00000000-0000-4000-8000-000000000091',
};
const issue = (id: string) => ({
  id,
  identifier: id,
  title: id,
  teamId: 'team-1',
  stateId: 'state-1',
  projectId: null,
});

beforeEach(() => {
  state.cursor = null;
  state.status = 'queued';
  state.imported = [];
  state.pages = 0;
  state.scheduledContexts = [];
  state.triggerHatchetWorkflow
    .mockReset()
    .mockImplementation(
      async (_path: string, payload: object, options?: { workflowRunId?: string }) => {
        const workflowRunId = options?.workflowRunId ?? state.activeWorkflowRunId;
        if (workflowRunId !== state.activeWorkflowRunId) {
          state.scheduledContexts.push({ requestPayload: payload, workflowRunId });
        }
        return { workflowRunId: `hatchet-dispatch:${workflowRunId}` };
      },
    );
  state.listTeams.mockReset().mockResolvedValue([
    {
      id: 'team-1',
      organizationId: 'org-1',
      visibility: 'public',
    },
  ]);
  state.listTeamIssues.mockReset();
});

describe('processLinearImportWorkflow', () => {
  it('enqueues a distinct dispatch to import more than one team page', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => issue(`issue-${index + 1}`));
    state.listTeamIssues
      .mockResolvedValueOnce({ issues: firstPage, endCursor: 'page-2', hasNextPage: true })
      .mockResolvedValueOnce({ issues: [issue('issue-51')], endCursor: null, hasNextPage: false });
    expect(await processLinearImportWorkflow({ requestPayload })).toMatchObject({
      status: 'queued',
      pagesProcessed: 1,
    });
    expect(state.scheduledContexts).toHaveLength(1);
    expect(state.triggerHatchetWorkflow).toHaveBeenCalledWith(
      '/api/workflows/linear-import/process',
      requestPayload,
      {
        concurrencyKey: requestPayload.jobId,
        workflowRunId: `linear-import:${requestPayload.jobId}:page:2`,
      },
    );
    expect(state.scheduledContexts[0]?.workflowRunId).toBe(
      `linear-import:${requestPayload.jobId}:page:2`,
    );
    expect(await processLinearImportWorkflow(state.scheduledContexts[0]!)).toMatchObject({
      status: 'completed',
      pagesProcessed: 2,
    });
    expect(state.imported).toEqual([...firstPage.map(({ id }) => id), 'issue-51']);
    expect(state.listTeamIssues.mock.calls[1][2]).toBe('page-2');
  });

  it('fails closed on an invalid continuation cursor', async () => {
    state.listTeamIssues.mockResolvedValue({ issues: [], endCursor: null, hasNextPage: true });
    await expect(processLinearImportWorkflow({ requestPayload })).rejects.toThrow(
      'invalid pagination cursor',
    );
    expect(state.status).toBe('failed');
    expect(state.triggerHatchetWorkflow).not.toHaveBeenCalled();
  });

  it('stops before fetching or writing when the selected team becomes private', async () => {
    state.listTeams.mockResolvedValue([
      { id: 'team-1', organizationId: 'org-1', visibility: 'private' },
    ]);
    await expect(processLinearImportWorkflow({ requestPayload })).rejects.toThrow(
      'no longer a public Linear team',
    );
    expect(state.status).toBe('failed');
    expect(state.listTeamIssues).not.toHaveBeenCalled();
    expect(state.imported).toEqual([]);
  });

  it('persists retryable failure if the next-page dispatch fails after page commit', async () => {
    state.listTeamIssues.mockResolvedValue({
      issues: [issue('issue-1')],
      endCursor: 'page-2',
      hasNextPage: true,
    });
    state.triggerHatchetWorkflow.mockRejectedValue(new Error('Hatchet unavailable'));
    await expect(processLinearImportWorkflow({ requestPayload })).rejects.toThrow(
      'Hatchet unavailable',
    );
    expect(state.cursor).toBe('page-2');
    expect(state.imported).toEqual(['issue-1']);
    expect(state.status).toBe('failed');
  });
});
