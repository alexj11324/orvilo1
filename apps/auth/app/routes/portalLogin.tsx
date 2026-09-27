import '../portal/styles.css';

import { useAuth, useClerk } from '@clerk/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { AccountsLoginForm } from '../portal/AccountsLoginForm';
import { AuthShell } from '../portal/AuthShell';
import { documentPortalMessages } from '../portal/messagesContext';
import { resolveStandaloneReturnUrl } from '../portal/redirect';
import { useProductOrigin } from '../portal/RuntimeClerkProvider';

export default function PortalLoginPage() {
  const productOrigin = useProductOrigin();
  const [params] = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const messages = documentPortalMessages();
  const redirecting = useRef(false);
  const signingOut = useRef(false);
  const [prepared, setPrepared] = useState(false);

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
      window.location.assign(returnUrl);
      return;
    }

    setPrepared(true);
  }, [forceSignOut, isLoaded, isSignedIn, returnUrl, signOut]);

  if (!prepared) {
    return (
      <AuthShell>
        <p role="status">{messages.preparing}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AccountsLoginForm returnUrl={returnUrl} />
    </AuthShell>
  );
}
