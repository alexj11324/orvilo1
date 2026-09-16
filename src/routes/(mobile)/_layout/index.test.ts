import { describe, expect, it } from 'vitest';

import { isMobileNavRoute } from './index';

describe('isMobileNavRoute', () => {
  it('keeps the tab bar on the task board, which is where the Tasks tab lands', () => {
    // The tab bar is the only navigation a phone viewport gets; losing it on the
    // destination its own tab points at would strand the user there.
    expect(isMobileNavRoute('/tasks', null)).toBe(true);
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

  it('still hides the tab bar where it never belonged', () => {
    expect(isMobileNavRoute('/settings/profile', null)).toBe(false);
    expect(isMobileNavRoute('/settings/profile', 'lobe-team')).toBe(false);
    expect(isMobileNavRoute('/agent/some-agent', null)).toBe(false);
  });

  it('does not treat an unrelated slug prefix as its own workspace', () => {
    // `/lobe-teamwork` must not have `lobe-team` carved off the front of it.
    expect(isMobileNavRoute('/lobe-teamwork/tasks', 'lobe-team')).toBe(false);
  });
});
