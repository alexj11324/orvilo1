import { describe, expect, it } from 'vitest';

import type { GlobalSearchResult, GlobalSearchWorkType } from '@/services/globalSearch';

import {
  globalSearchResultHref,
  globalSearchResultSubtitle,
  groupSearchResults,
} from './groupSearchResults';

const workItem = (
  type: GlobalSearchWorkType,
  id: string,
  title: string,
  description?: string,
): GlobalSearchResult => ({
  createdAt: new Date('2026-09-01'),
  description,
  id,
  relevance: 1,
  title,
  type,
  updatedAt: new Date('2026-09-02'),
});

const ftsItem = (
  type: string,
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
): GlobalSearchResult =>
  ({
    createdAt: new Date('2026-09-01'),
    description: null,
    id,
    relevance: 2,
    title,
    type,
    updatedAt: new Date('2026-09-02'),
    ...extra,
  }) as GlobalSearchResult;

describe('groupSearchResults', () => {
  it('groups work types first in Linear order, then content types', () => {
    const results = groupSearchResults([
      ftsItem('message', 'm-1', 'hello'),
      workItem('project', 'p-1', 'Website'),
      ftsItem('agent', 'a-1', 'Helper'),
      workItem('team', 'tm-1', 'Core'),
      workItem('task', 't-1', 'Ship it', 'ORV-1'),
      workItem('savedView', 'v-1', 'Triage'),
    ]);

    expect(results.map((group) => group.type)).toEqual([
      'task',
      'project',
      'savedView',
      'team',
      'message',
      'agent',
    ]);
  });

  it('preserves backend order within a group', () => {
    const results = groupSearchResults([
      workItem('task', 't-1', 'First'),
      workItem('task', 't-2', 'Second'),
      workItem('task', 't-3', 'Third'),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].items.map((item) => item.id)).toEqual(['t-1', 't-2', 't-3']);
  });

  it('drops marketplace and pageContent rows', () => {
    const results = groupSearchResults([
      ftsItem('mcp', 'mcp-1', 'Server'),
      ftsItem('plugin', 'pl-1', 'Plugin'),
      ftsItem('communityAgent', 'ca-1', 'Community'),
      ftsItem('pageContent', 'pc-1', 'Content'),
      workItem('task', 't-1', 'Keep me'),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('task');
  });

  it('returns an empty list for empty input', () => {
    expect(groupSearchResults([])).toEqual([]);
  });
});

describe('globalSearchResultSubtitle', () => {
  it('surfaces the task identifier as the subtitle', () => {
    expect(globalSearchResultSubtitle(workItem('task', 't-1', 'Ship it', 'ORV-123'))).toBe(
      'ORV-123',
    );
  });

  it('surfaces the team key as the subtitle', () => {
    expect(globalSearchResultSubtitle(workItem('team', 'tm-1', 'Core Team', 'CORE'))).toBe('CORE');
  });

  it('returns null when there is no description', () => {
    expect(globalSearchResultSubtitle(workItem('project', 'p-1', 'Website'))).toBeNull();
  });
});

describe('globalSearchResultHref', () => {
  it('maps work results to their detail routes', () => {
    expect(globalSearchResultHref(workItem('task', 'T-1', 'Ship the thing'))).toBe(
      '/task/T-1/ship-the-thing',
    );
    expect(globalSearchResultHref(workItem('project', 'p-1', 'Website'))).toBe('/project/p-1');
    expect(globalSearchResultHref(workItem('savedView', 'v-1', 'Triage'))).toBe('/views/v-1');
    expect(globalSearchResultHref(workItem('team', 'tm-1', 'Core'))).toBe('/teams/tm-1');
  });

  it('keeps a bare task path when the title has no slug', () => {
    expect(globalSearchResultHref(workItem('task', 'T-2', ''))).toBe('/task/T-2');
  });

  it('maps agent and group results', () => {
    expect(globalSearchResultHref(ftsItem('agent', 'a-1', 'Helper'))).toBe('/agent/a-1?agent=a-1');
    expect(globalSearchResultHref(ftsItem('chatGroup', 'g-1', 'Group'))).toBe('/group/g-1');
  });

  it('maps topics to their agent or group topic route', () => {
    expect(globalSearchResultHref(ftsItem('topic', 't-1', 'Topic', { agentId: 'a-1' }))).toBe(
      '/agent/a-1/t-1',
    );
    expect(globalSearchResultHref(ftsItem('topic', 't-2', 'Topic', { groupId: 'g-1' }))).toBe(
      '/group/g-1/t-2',
    );
    expect(globalSearchResultHref(ftsItem('topic', 't-3', 'Topic'))).toBe('/');
  });

  it('maps messages to the owning topic anchor', () => {
    expect(
      globalSearchResultHref(ftsItem('message', 'm-1', 'Hi', { agentId: 'a-1', topicId: 't-1' })),
    ).toBe('/agent/a-1/t-1#m-1');
    expect(
      globalSearchResultHref(ftsItem('message', 'm-2', 'Hi', { groupId: 'g-1', topicId: 't-2' })),
    ).toBe('/group/g-1/t-2#m-2');
  });

  it('maps files and folders into the resource library', () => {
    expect(globalSearchResultHref(ftsItem('file', 'f-1', 'Doc', { knowledgeBaseId: 'kb-1' }))).toBe(
      '/resource/library/kb-1?file=f-1',
    );
    expect(globalSearchResultHref(ftsItem('file', 'f-2', 'Doc'))).toBe('/resource?file=f-2');
    expect(
      globalSearchResultHref(
        ftsItem('folder', 'd-1', 'Specs', { knowledgeBaseId: 'kb-1', slug: 'specs' }),
      ),
    ).toBe('/resource/library/kb-1/specs');
  });

  it('returns null for types with no destination', () => {
    expect(globalSearchResultHref(ftsItem('mcp', 'mcp-1', 'Server'))).toBeNull();
  });
});
