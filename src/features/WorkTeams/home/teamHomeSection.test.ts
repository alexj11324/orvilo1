import { TRIAGE_EXCLUSION_FILTER } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  nextTeamHomeSectionNavigation,
  resolveTeamHomeSection,
  teamHomeSectionTo,
  teamRecentIssuesQuery,
} from './teamHomeSection';

describe('resolveTeamHomeSection', () => {
  it('defaults missing and unknown values to overview', () => {
    expect(resolveTeamHomeSection(null)).toBe('overview');
    expect(resolveTeamHomeSection(undefined)).toBe('overview');
    expect(resolveTeamHomeSection('')).toBe('overview');
    expect(resolveTeamHomeSection('settings')).toBe('overview');
  });

  it('keeps the three real sections', () => {
    expect(resolveTeamHomeSection('overview')).toBe('overview');
    expect(resolveTeamHomeSection('documents')).toBe('documents');
    expect(resolveTeamHomeSection('members')).toBe('members');
  });
});

describe('nextTeamHomeSectionNavigation', () => {
  it('drops the param for the default section but preserves everything else', () => {
    const current = new URLSearchParams('tab=home&section=documents&scope=active');
    const [next, options] = nextTeamHomeSectionNavigation(current, 'overview');
    expect(options).toEqual({ replace: false });
    expect(next.get('section')).toBeNull();
    expect(next.get('tab')).toBe('home');
    expect(next.get('scope')).toBe('active');
  });

  it('writes the section and pushes history for non-default sections', () => {
    const current = new URLSearchParams('tab=home');
    const [next] = nextTeamHomeSectionNavigation(current, 'members');
    expect(next.get('section')).toBe('members');
  });
});

describe('teamHomeSectionTo', () => {
  it('builds distinct workspace-link targets per section', () => {
    const current = new URLSearchParams('tab=home');
    expect(teamHomeSectionTo('team-42', current, 'overview')).toBe('/teams/team-42?tab=home');
    expect(teamHomeSectionTo('team-42', current, 'documents')).toBe(
      '/teams/team-42?tab=home&section=documents',
    );
    expect(teamHomeSectionTo('team-42', current, 'members')).toBe(
      '/teams/team-42?tab=home&section=members',
    );
  });

  it('forces tab=home back into links built from a foreign tab param', () => {
    const current = new URLSearchParams('tab=issues&scope=active');
    expect(teamHomeSectionTo('team-42', current, 'members')).toBe(
      '/teams/team-42?tab=home&scope=active&section=members',
    );
  });
});

describe('teamRecentIssuesQuery', () => {
  it('scopes to the team, newest activity first, no grouping', () => {
    expect(teamRecentIssuesQuery('team-42', false)).toEqual({
      entityType: 'task',
      filter: { all: [{ field: 'teamId', op: 'eq', value: 'team-42' }] },
      layout: 'list',
      schemaVersion: 1,
      sort: [{ direction: 'desc', field: 'updatedAt' }],
    });
  });

  it('excludes untriaged rows for triage-capable teams', () => {
    const query = teamRecentIssuesQuery('team-42', true);
    expect(query.filter?.all).toContainEqual(TRIAGE_EXCLUSION_FILTER);
  });
});
