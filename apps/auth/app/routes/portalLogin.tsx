import '../portal/styles.css';

import { useAuth, useClerk } from '@clerk/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { AccountsLoginForm } from '../portal/AccountsLoginForm';
import { AuthShell } from '../portal/AuthShell';
import { AUTH_CONTRACT } from '../portal/contract';
import { documentPortalMessages } from '../portal/messagesContext';
import { resolveStandaloneReturnUrl } from '../portal/redirect';
import { useProductOrigin } from '../portal/RuntimeClerkProvider';

/**
 * After the Clerk session is live, exchange it for the product's `orvilo_auth`
 * cookie (Cordy parity): the product origin owns `/api/auth/clerk`, which
 * verifies the session JWT and mints the shared-domain cookie.
 */
const exchangeClerkSession = async (
  productOrigin: string,
  getToken: () => Promise<string | null>,
) => {
  const sessionToken = await getToken();
  if (!sessionToken) throw new Error('Clerk session token unavailable');

  const exchangeUrl = new URL(`/api${AUTH_CONTRACT.client.clerkExchangePath}`, productOrigin);
  const response = await fetch(exchangeUrl, {
    credentials: 'include',
    headers: { authorization: `Bearer ${sessionToken}` },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Session exchange failed (${response.status})`);
  }
};

export default function PortalLoginPage() {
  const productOrigin = useProductOrigin();
  const [params] = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const messages = documentPortalMessages();
  const redirecting = useRef(false);
  const signingOut = useRef(false);
  const [prepared, setPrepared] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const returnUrl = useMemo(
    () =>
      resolveStandaloneReturnUrl(
        params.get('return_url') ?? params.get('redirect_url'),
        productOrigin,
      ),
    [params, productOrigin],
  );

  const forceSignOut = params.get('sign_out') === '1' || params.get('force') === '1';

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && forceSignOut && !signingOut.current) {
      signingOut.current = true;
      void signOut({ redirectUrl: '/login' }).catch(() => setPrepared(true));
      return;
    }

    if (isSignedIn && !redirecting.current) {
      redirecting.current = true;
      void exchangeClerkSession(productOrigin, getToken)
        .then(() => window.location.assign(returnUrl))
        .catch((error) => {
          // Without the app session the product would bounce straight back here —
          // surface the failure instead of looping the redirect.
          console.error('Session exchange failed:', error);
          redirecting.current = false;
          setExchangeError(error instanceof Error ? error.message : 'Session exchange failed');
          setPrepared(true);
        });
      return;
    }

    setPrepared(true);
  }, [forceSignOut, getToken, isLoaded, isSignedIn, productOrigin, returnUrl, signOut]);

  if (!prepared) {
    return (
      <AuthShell>
        <p role="status">{messages.preparing}</p>
      </AuthShell>
    );
  }

  if (exchangeError) {
    return (
      <AuthShell>
        <p role="alert">{exchangeError}</p>
        <AccountsLoginForm returnUrl={returnUrl} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AccountsLoginForm returnUrl={returnUrl} />
    </AuthShell>
  );
}
