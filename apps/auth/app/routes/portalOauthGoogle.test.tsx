import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PortalOauthGooglePage from './portalOauthGoogle';
import PortalOauthGoogleCallbackPage from './portalOauthGoogleCallback';

const mocks = vi.hoisted(() => ({
  clerk: { loaded: true, session: null as null | { id: string }, setActive: vi.fn() },
  navigate: vi.fn(),
  params: new URLSearchParams(),
  signIn: {
    create: vi.fn(),
    existingSession: null as null | { sessionId: string },
    finalize: vi.fn(),
    isTransferable: false,
    status: null as string | null,
  },
  signUp: {
    create: vi.fn(),
    existingSession: null as null | { sessionId: string },
    finalize: vi.fn(),
    isTransferable: false,
    status: null as string | null,
  },
}));

vi.mock('@clerk/react-router', () => ({
  useAuth: () => ({ isLoaded: true }),
  useClerk: () => mocks.clerk,
  useSignIn: () => ({ signIn: mocks.signIn }),
  useSignUp: () => ({ signUp: mocks.signUp }),
}));
vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.params],
}));
vi.mock('../portal/RuntimeClerkProvider', () => ({
  useProductOrigin: () => 'https://orvilo.aspectlylabs.com',
}));

interface Activation {
  navigate: (input: {
    decorateUrl: (url: string) => string;
    session: { currentTask?: object };
  }) => Promise<void>;
}
const activate = async ({ navigate }: Activation) => {
  await navigate({ decorateUrl: (url) => `${url}&__clerk_test=transport`, session: {} });
  return { error: null };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams({ return_url: 'https://orvilo.aspectlylabs.com/acme/issues' });
  mocks.clerk.session = null;
  mocks.clerk.setActive.mockImplementation(activate);
  for (const attempt of [mocks.signIn, mocks.signUp]) {
    attempt.status = null;
    attempt.isTransferable = false;
    attempt.existingSession = null;
    attempt.finalize.mockImplementation(activate);
    attempt.create.mockImplementation(async () => {
      attempt.status = 'complete';
      return { error: null };
    });
  }
});

const expectExchangeDestination = (destination: string) => {
  const url = new URL(destination, 'https://accounts.aspectlylabs.com');
  expect(url.origin).toBe('https://accounts.aspectlylabs.com');
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('return_url')).toBe('https://orvilo.aspectlylabs.com/acme/issues');
};

describe('Google success returns through the product session exchange', () => {
  it('sends an already signed-in session to portal login', () => {
    mocks.clerk.session = { id: 'existing' };
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    render(<PortalOauthGooglePage />);
    expect(replace).toHaveBeenCalledOnce();
    expectExchangeDestination(replace.mock.calls[0][0]);
  });

  it.each(['signIn', 'signInTransfer', 'signUpTransfer', 'existingSession'] as const)(
    'preserves Clerk URL decoration and goes to portal login after %s activation',
    async (path) => {
      if (path === 'signIn') mocks.signIn.status = 'complete';
      if (path === 'signInTransfer') mocks.signIn.isTransferable = true;
      if (path === 'signUpTransfer') mocks.signUp.isTransferable = true;
      if (path === 'existingSession') mocks.signIn.existingSession = { sessionId: 'existing' };
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      render(<PortalOauthGoogleCallbackPage />);
      await waitFor(() =>
        expect(mocks.navigate.mock.calls.length + assign.mock.calls.length).toBe(1),
      );
      const destination = mocks.navigate.mock.calls[0]?.[0] ?? assign.mock.calls[0]?.[0];
      expectExchangeDestination(destination);
      expect(
        new URL(destination, 'https://accounts.aspectlylabs.com').searchParams.get('__clerk_test'),
      ).toBe('transport');
    },
  );
});
