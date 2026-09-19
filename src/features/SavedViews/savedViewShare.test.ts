import { describe, expect, it } from 'vitest';

import { isSavedViewShareReady, savedViewCopyName, savedViewSharePatch } from './savedViewShare';

describe('savedViewSharePatch', () => {
  it('clears teamId when the view is not team-scoped', () => {
    expect(savedViewSharePatch('workspace', 'team_1')).toEqual({
      teamId: null,
      visibility: 'workspace',
    });
    expect(savedViewSharePatch('private', 'team_1')).toEqual({
      teamId: null,
      visibility: 'private',
    });
  });

  it('keeps teamId only for team visibility', () => {
    expect(savedViewSharePatch('team', 'team_1')).toEqual({
      teamId: 'team_1',
      visibility: 'team',
    });
  });
});

describe('isSavedViewShareReady', () => {
  it('requires a team before sharing with a team', () => {
    expect(isSavedViewShareReady('team', null)).toBe(false);
    expect(isSavedViewShareReady('team', 'team_1')).toBe(true);
    expect(isSavedViewShareReady('private', null)).toBe(true);
  });
});

describe('savedViewCopyName', () => {
  it('appends the copy label without inventing a name', () => {
    expect(savedViewCopyName('Assigned to me', 'copy')).toBe('Assigned to me copy');
    expect(savedViewCopyName('  ', 'copy')).toBe('copy');
  });
});
