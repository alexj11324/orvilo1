import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS } from '@/store/global/initialState';

import { resolveCollapsedTeamKeys, resolveExpandedTeamKeys, useTeamSubNav } from './useTeamSubNav';

/**
 * "Your teams" sub-navigation expansion (Linear parity): every joined team shows
 * Home / Triage / Issues / Projects / Views until the user folds that team away.
 *
 * The regression this suite guards: the open set used to be *stored*, so a team
 * that was not in the persisted list came back folded — which is every team for
 * an account whose keys predate the sub-navigation, and every team joined later.
 * Folding is the only state worth remembering, and it must survive a reload.
 */

// Teams render inside a workspace (the OSS stub reports none), so route the
// store's workspace-scoped writes and reads through an active workspace.
vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getActiveWorkspaceId: () => 'ws-t',
  useActiveWorkspaceId: () => 'ws-t',
}));

const TEAM_KEYS = ['team:team-1', 'team:team-2'];

const collapsedKeys = () => useGlobalStore.getState().status.workspace?.sidebarCollapsedKeys;

const mountSubNav = (teamKeys: string[] = TEAM_KEYS) =>
  renderHook(({ keys }: { keys: string[] }) => useTeamSubNav(keys), {
    initialProps: { keys: teamKeys },
  });

beforeEach(() => {
  useGlobalStore.setState((s) => ({
    isStatusInit: true,
    status: {
      ...s.status,
      // A fresh account: the group keys, and no per-team entry at all.
      sidebarCollapsedKeys: undefined,
      sidebarExpandedKeys: [...DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS],
      workspace: undefined,
    },
  }));
});

describe('useTeamSubNav', () => {
  it('reports every team as expanded when no fold was ever stored', () => {
    const { result } = mountSubNav();

    expect(result.current.expandedTeamKeys).toEqual(TEAM_KEYS);
  });

  it('reports team keys left in the old expanded-keys bucket as expanded too', () => {
    // Data written before the fold set existed: the sub-navigation shared
    // `sidebarExpandedKeys`. Those entries are inert now — they fold nothing.
    useGlobalStore.setState((s) => ({
      status: {
        ...s.status,
        sidebarExpandedKeys: [...DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS, 'team:team-9'],
      },
    }));

    const { result } = mountSubNav();

    expect(result.current.expandedTeamKeys).toEqual(TEAM_KEYS);
  });

  it('records a fold and keeps the team folded after a reload', () => {
    const first = mountSubNav();

    // The accordion reports the open set; the complement is what gets stored.
    act(() => first.result.current.setExpandedTeamKeys(['team:team-2']));

    expect(collapsedKeys()).toEqual(['team:team-1']);
    expect(first.result.current.expandedTeamKeys).toEqual(['team:team-2']);

    // Reload: same persisted preference, fresh mount.
    first.unmount();
    const reloaded = mountSubNav();

    expect(reloaded.result.current.expandedTeamKeys).toEqual(['team:team-2']);
  });

  it('folds only the team that was closed', () => {
    const { result } = mountSubNav();

    act(() => result.current.setExpandedTeamKeys(['team:team-2']));

    expect(result.current.expandedTeamKeys).toEqual(['team:team-2']);
    expect(collapsedKeys()).toEqual(['team:team-1']);
  });

  it('re-opens a folded team', () => {
    const { result } = mountSubNav();

    act(() => result.current.setExpandedTeamKeys(['team:team-2']));
    act(() => result.current.setExpandedTeamKeys(TEAM_KEYS));

    expect(result.current.expandedTeamKeys).toEqual(TEAM_KEYS);
    expect(collapsedKeys()).toEqual([]);
  });

  it('expands a team that joins after the preference was written', () => {
    const { result, rerender } = mountSubNav(['team:team-1']);

    act(() => result.current.setExpandedTeamKeys([]));
    expect(result.current.expandedTeamKeys).toEqual([]);

    // A new team shows up in the roster; it has no stored fold.
    rerender({ keys: ['team:team-1', 'team:team-3'] });

    expect(result.current.expandedTeamKeys).toEqual(['team:team-3']);
  });

  it('drops the stored fold of a team that left the roster', () => {
    const { result, rerender } = mountSubNav();

    act(() => result.current.setExpandedTeamKeys(['team:team-2']));
    expect(collapsedKeys()).toEqual(['team:team-1']);

    // team-1 leaves the roster; the next write must not keep its stale entry.
    rerender({ keys: ['team:team-2'] });
    act(() => result.current.setExpandedTeamKeys(['team:team-2']));

    expect(collapsedKeys()).toEqual([]);
  });

  it('has nothing to expand and nothing to store without a team', () => {
    const { result } = mountSubNav([]);

    expect(result.current.expandedTeamKeys).toEqual([]);

    act(() => result.current.setExpandedTeamKeys([]));

    expect(collapsedKeys()).toEqual([]);
  });
});

describe('resolveExpandedTeamKeys', () => {
  it('treats an unknown key as expanded', () => {
    expect(resolveExpandedTeamKeys(['team:team-1'], [])).toEqual(['team:team-1']);
  });

  it('drops only the folded keys', () => {
    expect(resolveExpandedTeamKeys(['team:team-1', 'team:team-2'], ['team:team-1'])).toEqual([
      'team:team-2',
    ]);
  });
});

describe('resolveCollapsedTeamKeys', () => {
  it('returns the complement of the open set', () => {
    expect(resolveCollapsedTeamKeys(['team:team-1', 'team:team-2'], ['team:team-2'])).toEqual([
      'team:team-1',
    ]);
  });

  it('ignores keys outside the roster', () => {
    expect(resolveCollapsedTeamKeys(['team:team-1'], ['team:team-1', 'workspace'])).toEqual([]);
  });
});
