import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFirstLoginGate } from './useFirstLoginGate';

const mocks = vi.hoisted(() => ({
  pathname: '/acme/tasks',
  state: {
    isSignedIn: true,
    isLoaded: true,
    isUserStateInit: true,
    isUserStateInitError: undefined as unknown,
    onboarding: undefined as { finishedAt?: string } | undefined,
    refreshUserState: vi.fn(),
  },
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (s: typeof mocks.state) => unknown) => selector(mocks.state),
}));
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: mocks.pathname, search: '' }),
}));

beforeEach(() => {
  mocks.pathname = '/acme/tasks';
  mocks.state.onboarding = undefined;
  mocks.state.isUserStateInit = true;
  mocks.state.isUserStateInitError = undefined;
  mocks.state.isSignedIn = true;
});
describe('first login entry', () => {
  it('gates a generic landing immediately after the first sign-in transition', () => {
    mocks.pathname = '/projects';
    mocks.state.isSignedIn = false;
    const view = renderHook(useFirstLoginGate);
    expect(view.result.current.status).toBe('allowed');
    mocks.state.isSignedIn = true;
    mocks.state.isUserStateInit = false;
    view.rerender();
    expect(view.result.current.status).toBe('loading');
    mocks.state.isUserStateInit = true;
    view.rerender();
    expect(view.result.current.status).toBe('redirect');
    expect(view.result.current.target).toContain('/onboarding?callbackUrl=');
  });
  it('blocks direct workspace app links until onboarding finishes', () => {
    const gate = renderHook(useFirstLoginGate).result.current;
    expect(gate.status).toBe('redirect');
    expect(gate.target).toContain('/onboarding?callbackUrl=');
  });
  it('keeps provider and credential setup reachable', () => {
    mocks.pathname = '/acme/settings/credential';
    expect(renderHook(useFirstLoginGate).result.current.status).toBe('allowed');
  });
  it('preserves existing completed users', () => {
    mocks.state.onboarding = { finishedAt: '2026-01-01' };
    expect(renderHook(useFirstLoginGate).result.current.status).toBe('allowed');
  });
  it('blocks the main app while the account loads or fails', () => {
    mocks.state.isUserStateInit = false;
    const view = renderHook(useFirstLoginGate);
    expect(view.result.current.status).toBe('loading');
    mocks.state.isUserStateInitError = new Error('failed');
    view.rerender();
    expect(view.result.current.status).toBe('error');
  });
});
