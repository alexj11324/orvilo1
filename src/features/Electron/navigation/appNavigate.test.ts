/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as slugModule from '@/business/client/hooks/useActiveWorkspaceSlug';

import { appNavigate } from './appNavigate';

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@/features/Workspace/stableWorkspaceAwareNavigate', () => ({
  stableWorkspaceAwareNavigate: mocks.navigate,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.navigate.mockReset();
});

describe('appNavigate (web)', () => {
  it('navigates the single router by default', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    appNavigate('/task/T-1', { replace: true });

    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-1', { replace: true });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a browser tab on the workspace-resolved route for `newTab`', () => {
    vi.spyOn(slugModule, 'getActiveWorkspaceSlug').mockReturnValue('acme');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    appNavigate('/task/T-1', { target: 'newTab' });

    expect(open).toHaveBeenCalledWith('/acme/task/T-1', '_blank', 'noopener,noreferrer');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps an escaped destination unprefixed in the new tab', () => {
    vi.spyOn(slugModule, 'getActiveWorkspaceSlug').mockReturnValue('acme');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    appNavigate('/settings', { escape: true, target: 'newTab' });

    expect(open).toHaveBeenCalledWith('/settings', '_blank', 'noopener,noreferrer');
  });
});
