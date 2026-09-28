import { describe, expect, it } from 'vitest';

import { isMobileNavRoute } from './index';

describe('isMobileNavRoute', () => {
  it('keeps the tab bar on the work inbox, which is where the Inbox tab lands', () => {
    expect(isMobileNavRoute('/inbox', null)).toBe(true);
    expect(isMobileNavRoute('/lobe-team/inbox', 'lobe-team')).toBe(true);
  });

  it('keeps the tab bar on the personal destinations', () => {
    expect(isMobileNavRoute('/', null)).toBe(true);
    expect(isMobileNavRoute('/me', null)).toBe(true);
  });

  it('drops a workspace prefix before matching', () => {
    // `useWorkspaceAwareNavigate` mirrors `/tasks` under `/:workspaceSlug`, so a
    // raw-pathname comparison would hide the tab bar inside every workspace.
    expect(isMobileNavRoute('/lobe-team/tasks', 'lobe-team')).toBe(true);
    expect(isMobileNavRoute('/lobe-team', 'lobe-team')).toBe(true);
  });

  it('does not hide the tab bar on a nested workspace route it covers', () => {
    expect(isMobileNavRoute('/lobe-team/me', 'lobe-team')).toBe(true);
  });

  it('keeps the tab bar on My issues, Views and Teams', () => {
    expect(isMobileNavRoute('/my-issues', null)).toBe(true);
    expect(isMobileNavRoute('/lobe-team/views/view-1', 'lobe-team')).toBe(true);
    expect(isMobileNavRoute('/lobe-team/teams/team-1', 'lobe-team')).toBe(true);
  });

  it('still hides the tab bar where it never belonged', () => {
    expect(isMobileNavRoute('/settings/profile', null)).toBe(false);
    expect(isMobileNavRoute('/settings/profile', 'lobe-team')).toBe(false);
    expect(isMobileNavRoute('/agent/some-agent', null)).toBe(false);
  });

  it('hides the tab bar on retired surfaces', () => {
    // /community (and its sub-pages), /image, /video and /eval are withdrawn —
    // a tab bar rendered on their tombstones would offer navigation into
    // products that no longer resolve.
    expect(isMobileNavRoute('/community', null)).toBe(false);
    expect(isMobileNavRoute('/community/agent', null)).toBe(false);
    expect(isMobileNavRoute('/image', null)).toBe(false);
    expect(isMobileNavRoute('/video', null)).toBe(false);
    expect(isMobileNavRoute('/eval', null)).toBe(false);
  });

  it('does not treat an unrelated slug prefix as its own workspace', () => {
    // `/lobe-teamwork` must not have `lobe-team` carved off the front of it.
    expect(isMobileNavRoute('/lobe-teamwork/tasks', 'lobe-team')).toBe(false);
  });
});
