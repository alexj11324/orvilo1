import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildGoogleLoginUrl } from './AccountsLoginForm';
import { en, messagesForLocale } from './messages';
import { useAccountsSignIn } from './useAccountsSignIn';

const mocks = vi.hoisted(() => ({
  setActive: vi.fn(),
  signIn: {
    create: vi.fn(),
    emailCode: {
      sendCode: vi.fn(),
      verifyCode: vi.fn(),
    },
    finalize: vi.fn(),
    password: vi.fn(),
    reset: vi.fn(),
    status: 'needs_first_factor' as string,
    supportedFirstFactors: [] as { strategy: string }[],
  },
  signUp: {
    create: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    status: null as string | null,
    update: vi.fn(),
    verifications: { externalAccount: { status: null as string | null } },
  },
}));

vi.mock('@clerk/react-router', () => ({
  useSignIn: () => ({ setActive: mocks.setActive, signIn: mocks.signIn }),
  useSignUp: () => ({ setActive: mocks.setActive, signUp: mocks.signUp }),
}));

const renderSignIn = () => renderHook(() => useAccountsSignIn(en));

beforeEach(() => {
  mocks.signIn.create.mockReset();
  mocks.signIn.emailCode.sendCode.mockReset().mockResolvedValue({ error: null });
  mocks.signIn.emailCode.verifyCode.mockReset().mockResolvedValue({ error: null });
  mocks.signIn.password.mockReset();
  mocks.signIn.finalize.mockReset().mockResolvedValue({ error: null });
  mocks.signIn.reset.mockReset();
  mocks.signIn.status = 'needs_first_factor';
  mocks.signIn.supportedFirstFactors = [];
  mocks.signUp.status = null;
  mocks.signUp.finalize.mockReset().mockResolvedValue({ error: null });
  mocks.signUp.verifications.externalAccount.status = null;
  mocks.signUp.reset.mockReset();
  mocks.signUp.create.mockReset();
  mocks.signUp.update.mockReset();
  mocks.setActive.mockReset().mockResolvedValue(undefined);
});

describe('messagesForLocale', () => {
  it('routes every zh spelling to zh-Hans and the rest to en', () => {
    // `login` is the same brand line in every locale, so it cannot tell them apart.
    expect(messagesForLocale('zh-CN').back).toBe('返回');
    expect(messagesForLocale('zh-Hans').back).toBe('返回');
    expect(messagesForLocale('en-US').back).toBe('Back');
    expect(messagesForLocale('ja-JP').back).toBe('Back');
  });
});

describe('buildGoogleLoginUrl', () => {
  it('preserves the runtime staging return target', () => {
    const url = new URL(
      buildGoogleLoginUrl(
        'https://staging.aspectlylabs.com/acme/issues',
        'https://accounts.staging.aspectlylabs.com',
        'https://staging.aspectlylabs.com',
      ),
    );
    expect(url.origin).toBe('https://accounts.staging.aspectlylabs.com');
    expect(url.searchParams.get('return_url')).toBe('https://staging.aspectlylabs.com/acme/issues');
  });

  it('keeps the standalone product return target on the Google route', () => {
    expect(
      buildGoogleLoginUrl(
        'https://orvilo.aspectlylabs.com/login',
        'https://accounts.aspectlylabs.com',
      ),
    ).toBe(
      'https://accounts.aspectlylabs.com/oauth/google?return_url=https%3A%2F%2Forvilo.aspectlylabs.com%2Flogin',
    );
  });

  it('does not leak foreign origins into the Google return target', () => {
    const url = new URL(
      buildGoogleLoginUrl('https://evil.example/login', 'https://accounts.aspectlylabs.com'),
    );
    expect(url.origin).toBe('https://accounts.aspectlylabs.com');
    expect(url.searchParams.get('return_url')).toBe('https://orvilo.aspectlylabs.com/');
  });
});

describe('useAccountsSignIn', () => {
  it('resumes verified OAuth signup at the requirements step', async () => {
    mocks.signUp.status = 'missing_requirements';
    mocks.signUp.verifications.externalAccount.status = 'verified';
    const { result } = renderSignIn();

    await waitFor(() => expect(result.current.step).toBe('requirements'));
    expect(mocks.signIn.create).not.toHaveBeenCalled();
  });

  it('starts Clerk email-code verification when no password factor exists', async () => {
    mocks.signIn.create.mockResolvedValue({ error: null });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));

    expect(mocks.signIn.create).toHaveBeenCalledWith({
      identifier: 'person@example.com',
      signUpIfMissing: true,
    });
    expect(mocks.signIn.emailCode.sendCode).toHaveBeenCalledOnce();
    expect(result.current.step).toBe('code');
    expect(result.current.email).toBe('person@example.com');
    expect(result.current.error).toBeNull();
  });

  it('activates the Clerk session after verifying the email code', async () => {
    mocks.signIn.create.mockResolvedValue({ error: null });
    mocks.signIn.emailCode.verifyCode.mockImplementation(async () => {
      mocks.signIn.status = 'complete';
      return { error: null };
    });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));
    act(() => result.current.setCode('123456'));
    await act(() => result.current.submitCode());

    expect(mocks.signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' });
    expect(mocks.signIn.finalize).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('lands on the password step when the account supports password sign-in', async () => {
    mocks.signIn.create.mockImplementation(async () => {
      mocks.signIn.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
      return { error: null };
    });
    mocks.signIn.password.mockImplementation(async () => {
      mocks.signIn.status = 'complete';
      return { error: null };
    });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));

    expect(result.current.step).toBe('password');
    expect(result.current.supportsEmailCode).toBe(true);
    expect(mocks.signIn.emailCode.sendCode).not.toHaveBeenCalled();

    act(() => result.current.setPassword('correct horse battery staple'));
    await act(() => result.current.submitPassword());

    expect(mocks.signIn.password).toHaveBeenCalledWith({
      password: 'correct horse battery staple',
    });
    expect(mocks.signIn.finalize).toHaveBeenCalledOnce();
  });

  it('lets password-capable accounts fall back to a verification code', async () => {
    mocks.signIn.create.mockImplementation(async () => {
      mocks.signIn.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
      return { error: null };
    });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));
    expect(result.current.step).toBe('password');

    await act(() => result.current.switchToCode());

    expect(mocks.signIn.emailCode.sendCode).toHaveBeenCalledOnce();
    expect(result.current.step).toBe('code');
  });

  it('surfaces a Clerk password error without switching steps', async () => {
    mocks.signIn.create.mockImplementation(async () => {
      mocks.signIn.supportedFirstFactors = [{ strategy: 'password' }];
      return { error: null };
    });
    mocks.signIn.password.mockResolvedValue({
      error: { errors: [{ longMessage: 'Password is incorrect.' }] },
    });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));
    act(() => result.current.setPassword('wrong'));
    await act(() => result.current.submitPassword());

    expect(result.current.step).toBe('password');
    expect(result.current.error).toBe('Password is incorrect.');
    expect(mocks.signIn.finalize).not.toHaveBeenCalled();
  });

  it('transfers to sign-up requirements when the code hits a missing account', async () => {
    mocks.signIn.create.mockResolvedValue({ error: null });
    mocks.signIn.emailCode.verifyCode.mockResolvedValue({
      error: { errors: [{ code: 'sign_up_if_missing_transfer' }] },
    });
    mocks.signUp.create.mockImplementation(async () => {
      mocks.signUp.status = 'missing_requirements';
      return { error: null };
    });
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('person@example.com'));
    act(() => result.current.setCode('123456'));
    await act(() => result.current.submitCode());

    expect(mocks.signUp.create).toHaveBeenCalledWith({ transfer: true });
    expect(result.current.step).toBe('requirements');
  });

  it('rejects empty emails without calling Clerk', async () => {
    const { result } = renderSignIn();

    await act(() => result.current.submitEmail('   '));

    expect(mocks.signIn.create).not.toHaveBeenCalled();
    expect(result.current.error).toBe(en.emailRequired);
  });
});
