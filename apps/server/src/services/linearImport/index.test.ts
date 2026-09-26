import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncModel } from '@/database/models/linearSync';
import type { OrviloDatabase } from '@/database/type';

import { LinearImportService } from './index';

const provider = vi.hoisted(() => ({ listTeams: vi.fn(), listTeamIssues: vi.fn() }));
vi.mock('@/server/services/linearSync/provider', () => ({
  createLinearGraphqlIssueProvider: () => provider,
}));

const installationId = '00000000-0000-4000-8000-000000000099';
const team = {
  id: 'team-1',
  key: 'IMP',
  name: 'Import team',
  organizationId: 'org-1',
  visibility: 'public',
  workflowStates: [
    { id: 'state-1', name: 'Active', type: 'started', teamId: 'team-1', position: 1 },
  ],
};
const service = new LinearImportService({} as OrviloDatabase, 'workspace-1');

beforeEach(() => {
  vi.spyOn(LinearSyncModel.prototype, 'findInstallationById').mockResolvedValue({
    id: installationId,
    organizationId: 'org-1',
    status: 'active',
  } as Awaited<ReturnType<LinearSyncModel['findInstallationById']>>);
  provider.listTeams.mockReset().mockResolvedValue([team]);
  provider.listTeamIssues.mockReset().mockResolvedValue({
    issues: [
      { id: 'issue-1', identifier: 'IMP-1', title: 'First', teamId: team.id, projectId: null },
    ],
    endCursor: 'next-page',
    hasNextPage: true,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('LinearImportService', () => {
  it('reports a lower bound rather than inventing a team issue total', async () => {
    const result = await service.preview(installationId, team.id);
    expect(result.counts).toEqual({ issues: 1, exact: false });
    expect(result.states).toEqual([
      { id: 'state-1', name: 'Active', type: 'started', suggestedCategory: 'in_progress' },
    ]);
  });

  it('rejects private teams before reading their issues', async () => {
    provider.listTeams.mockResolvedValue([{ ...team, visibility: 'private' }]);
    await expect(service.preview(installationId, team.id)).rejects.toThrow('public Linear team');
    expect(provider.listTeamIssues).not.toHaveBeenCalled();
  });

  it('requires complete mappings before starting a job', async () => {
    await expect(
      service.start({
        installationId,
        teamId: team.id,
        projectId: 'project-1',
        requestedByUserId: 'user-1',
        stateMappings: [],
      }),
    ).rejects.toThrow('Every Linear team state');
  });
});
