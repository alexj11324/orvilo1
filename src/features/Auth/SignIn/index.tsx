'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

import BrandTextLoading from '@/components/Loading/BrandTextLoading';
import { useAuthServerConfigStore } from '@/features/AuthShell/AuthServerConfigProvider';
import { sanitizeRedirectPath } from '@/utils/onboardingRedirect';

/**
 * Sign-in is owned by the accounts portal (Clerk). This page is a bounce:
 * it forwards `callbackUrl` to the portal's `return_url`, forwards
 * `signed_out` as the portal's `sign_out` flag (ends the Clerk session too),
 * and preserves `reason` (e.g. `sessionExpired`) for the portal.
 */
const SignIn = () => {
  const [searchParams] = useSearchParams();
  const accountsUrl = useAuthServerConfigStore(
    (s) => s.serverConfig.authAccountsUrl || 'https://accounts.aspectlylabs.com',
  );

  useEffect(() => {
    const callbackUrl = sanitizeRedirectPath(searchParams.get('callbackUrl'));
    const returnUrl = new URL(callbackUrl, window.location.origin).href;

    const loginUrl = new URL('/login', accountsUrl);
    loginUrl.searchParams.set('return_url', returnUrl);
    if (searchParams.get('signed_out')) loginUrl.searchParams.set('sign_out', '1');
    const reason = searchParams.get('reason');
    if (reason) loginUrl.searchParams.set('reason', reason);
    const hl = searchParams.get('hl');
    if (hl) loginUrl.searchParams.set('hl', hl);

    // `replace` keeps the intermediate /signin hop out of history so Back
    // doesn't loop the user straight back to the portal.
    window.location.replace(loginUrl.href);
  }, [accountsUrl, searchParams]);

  return <BrandTextLoading debugId="SignInPortalRedirect" />;
};

export default SignIn;
