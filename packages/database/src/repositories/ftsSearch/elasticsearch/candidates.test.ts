import { describe, expect, it, vi } from 'vitest';

import type { FtsSearchBackendRequest } from '../types';
import { searchElasticsearchCandidates } from './candidates';
import type { ElasticsearchFtsSearchInput } from './types';

const request = (callerAgentVisibility?: 'private' | 'public'): FtsSearchBackendRequest => ({
  entity: 'documents',
  filters: { documentKind: 'page' },
  pagination: { limit: 10 },
  query: { text: 'team page' },
  scope: { callerAgentVisibility, userId: 'member', workspaceId: 'workspace' },
});

const candidateQuery = async (
  candidateRequest: FtsSearchBackendRequest,
  target: { documentKind: 'page'; entity: 'documents' } | { entity: 'agents' },
) => {
  const search = vi.fn(async (_input: ElasticsearchFtsSearchInput) => ({
    hits: { hits: [], total: 0 },
  }));
  await searchElasticsearchCandidates(
    { client: { search }, indexNamespace: 'test' },
    candidateRequest,
    target,
    candidateRequest.query.text,
  );
  return search.mock.calls[0][0].body.query;
};

describe('Elasticsearch team document candidates', () => {
  it('overfetches team documents for ordinary workspace callers before live ACL hydration', async () => {
    await expect(
      candidateQuery(request(), { documentKind: 'page', entity: 'documents' }),
    ).resolves.toEqual(
      expect.objectContaining({
        bool: expect.objectContaining({
          filter: expect.arrayContaining([
            expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([{ term: { visibility: 'team' } }]),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('keeps team candidates out of public-agent and non-document searches', async () => {
    const publicDocument = await candidateQuery(request('public'), {
      documentKind: 'page',
      entity: 'documents',
    });
    const agentRequest = { ...request(), entity: 'agents' as const, filters: {} };
    const agents = await candidateQuery(agentRequest, { entity: 'agents' });

    expect(JSON.stringify(publicDocument)).not.toContain('"visibility":"team"');
    expect(JSON.stringify(agents)).not.toContain('"visibility":"team"');
  });
});
