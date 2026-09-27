import { useSignIn, useSignUp } from '@clerk/react-router';
import { useEffect, useState } from 'react';

import { clerkErrorCode, clerkErrorMessage } from './clerkError';
import type { PortalMessages } from './messages';

export type AccountsSignInStep = 'code' | 'email' | 'password' | 'requirements';

export const useAccountsSignIn = (messages: PortalMessages) => {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<AccountsSignInStep>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      signUp?.status === 'missing_requirements' &&
      signUp.verifications.externalAccount.status === 'verified'
    ) {
      setStep('requirements');
    }
  }, [signUp?.status, signUp?.verifications.externalAccount.status]);

  const reset = () => {
    setStep('email');
    setCode('');
    setPassword('');
    setError(null);
    void signIn?.reset();
    void signUp?.reset();
  };

  const requireSessionTaskFree = async ({ session }: { session: { currentTask?: unknown } }) => {
    if (session.currentTask) {
      throw new Error(messages.authTaskRequired);
    }
  };

  const finishSignIn = async () => {
    if (!signIn) throw new Error('Clerk sign-in is unavailable');
    const result = await signIn.finalize({ navigate: requireSessionTaskFree });
    if (result.error) throw result.error;
  };

  const finishSignUp = async () => {
    if (!signUp) throw new Error('Clerk sign-up is unavailable');
    const result = await signUp.finalize({ navigate: requireSessionTaskFree });
    if (result.error) throw result.error;
  };

  const transferToSignUp = async () => {
    if (!signUp) throw new Error('Clerk sign-up is unavailable');
    const result = await signUp.create({ transfer: true });
    if (result.error) throw result.error;
    if (signUp.status === 'complete') {
      await finishSignUp();
      return;
    }
    if (signUp.status === 'missing_requirements') {
      setStep('requirements');
      return;
    }
    throw new Error(messages.missingRequirements);
  };

  const sendVerificationCode = async () => {
    if (!signIn) throw new Error('Clerk sign-in is unavailable');
    const sendCode = await signIn.emailCode.sendCode();
    if (sendCode.error) throw sendCode.error;
    setStep('code');
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(clerkErrorMessage(failure, fallback));
    } finally {
      setLoading(false);
    }
  };

  const submitEmail = async (rawEmail: string) => {
    if (!signIn || !signUp) return;
    const normalizedEmail = rawEmail.trim();
    if (!normalizedEmail) {
      setError(messages.emailRequired);
      return;
    }

    await run(async () => {
      const result = await signIn.create({
        identifier: normalizedEmail,
        signUpIfMissing: true,
      });
      if (result.error) throw result.error;
      setEmail(normalizedEmail);
      if (signIn.supportedFirstFactors?.some((factor) => factor.strategy === 'password') === true) {
        setStep('password');
        return;
      }
      await sendVerificationCode();
    }, messages.authError);
  };

  const submitPassword = async () => {
    if (!signIn || !password) return;
    await run(async () => {
      const result = await signIn.password({ password });
      if (result.error) throw result.error;
      if (signIn.status === 'complete') {
        await finishSignIn();
        return;
      }
      throw new Error(messages.verificationIncomplete);
    }, messages.passwordError);
  };

  const submitCode = async () => {
    if (!signIn || !signUp || !code.trim()) return;
    await run(async () => {
      const result = await signIn.emailCode.verifyCode({ code: code.trim() });
      if (result.error) {
        if (clerkErrorCode(result.error) === 'sign_up_if_missing_transfer') {
          await transferToSignUp();
          return;
        }
        throw result.error;
      }
      if (signIn.status === 'complete') {
        await finishSignIn();
        return;
      }
      throw new Error(messages.verificationIncomplete);
    }, messages.verificationError);
  };

  const submitRequirements = async (legalAccepted: boolean) => {
    if (!signUp || !legalAccepted) return;
    await run(async () => {
      const result = await signUp.update({ legalAccepted: true });
      if (result.error) throw result.error;
      if (signUp.status === 'complete') {
        await finishSignUp();
        return;
      }
      throw new Error(messages.missingRequirements);
    }, messages.authError);
  };

  const resendCode = async () => {
    if (!signIn) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.emailCode.sendCode();
      if (result.error) setError(clerkErrorMessage(result.error, messages.authError));
    } finally {
      setLoading(false);
    }
  };

  const runGoogle = async (onGoogleLogin: () => Promise<void> | void) => {
    if (loading) return;
    await run(() => onGoogleLogin(), messages.startFailed);
  };

  const supportsEmailCode =
    signIn?.supportedFirstFactors?.some((factor) => factor.strategy === 'email_code') === true;

  return {
    code,
    email,
    error,
    loading,
    password,
    resendCode,
    reset,
    runGoogle,
    setCode,
    setEmail,
    setPassword,
    signIn,
    step,
    submitCode,
    submitEmail,
    submitPassword,
    submitRequirements,
    supportsEmailCode,
    switchToCode: () => run(sendVerificationCode, messages.authError),
  };
};
