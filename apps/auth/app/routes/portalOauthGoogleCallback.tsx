import '../portal/styles.css';

import { useClerk, useSignIn, useSignUp } from '@clerk/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { AuthShell } from '../portal/AuthShell';
import { consumeGoogleOAuthNonce, googleOAuthAttemptIsReady } from '../portal/googleOAuth';
import { documentPortalMessages } from '../portal/messagesContext';
import { resolveStandaloneReturnUrl } from '../portal/redirect';
import { useProductOrigin } from '../portal/RuntimeClerkProvider';

export default function PortalOauthGoogleCallbackPage() {
  const productOrigin = useProductOrigin();
  const [params] = useSearchParams();
  const returnUrl = useMemo(
    () =>
      resolveStandaloneReturnUrl(
        params.get('return_url') ?? params.get('redirect_url'),
        productOrigin,
      ),
    [params, productOrigin],
  );
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const navigate = useNavigate();
  const messages = documentPortalMessages();
  const attempted = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!clerk.loaded || attempted.current || !signIn || !signUp) return;
    const destination = `/login?${new URLSearchParams({ return_url: returnUrl })}`;
    const fail = () => setError(true);
    const navigateTo = (url: string) =>
      /^https?:\/\//.test(url) ? window.location.assign(url) : navigate(url, { replace: true });
    type Options = NonNullable<Parameters<typeof signIn.finalize>[0]>;
    const onNavigate: NonNullable<Options['navigate']> = async ({ session, decorateUrl }) => {
      if (session?.currentTask) return fail();
      navigateTo(decorateUrl(destination));
    };
    const run = async () => {
      if (!(await consumeGoogleOAuthNonce(signIn, params.get('rotating_token_nonce')))) return;
      if (!googleOAuthAttemptIsReady(signIn, signUp)) return;
      attempted.current = true;
      if (signIn.status === 'complete') {
        const result = await signIn.finalize({ navigate: onNavigate });
        if (result.error) fail();
        return;
      }
      if (signIn.isTransferable) {
        const transfer = await signUp.create({ transfer: true });
        if (transfer.error || (signUp.status as string) !== 'complete') return fail();
        const result = await signUp.finalize({ navigate: onNavigate });
        if (result.error) fail();
        return;
      }
      if (signUp.isTransferable) {
        const transfer = await signIn.create({ transfer: true });
        if (transfer.error || (signIn.status as string) !== 'complete') return fail();
        const result = await signIn.finalize({ navigate: onNavigate });
        if (result.error) fail();
        return;
      }
      const session = signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
      if (!session) return fail();
      await clerk.setActive({
        navigate: async ({ session: active, decorateUrl }) => {
          if (active?.currentTask) return fail();
          navigateTo(decorateUrl(destination));
        },
        session,
      });
    };
    void run().catch(fail);
  }, [clerk, navigate, params, returnUrl, signIn, signUp]);

  return (
    <AuthShell>
      <p role={error ? 'alert' : 'status'}>
        {error ? messages.completeFailed : messages.completing}
      </p>
      <div id="clerk-captcha" />
    </AuthShell>
  );
}
