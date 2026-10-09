import { useAuth, useClerk } from '@clerk/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';

import { AuthNotice, AuthShell } from '../portal/AuthShell';
import { hasClerkOAuthReturn, startGoogleOAuth } from '../portal/googleOAuth';
import { documentPortalMessages } from '../portal/messagesContext';
import { resolveStandaloneReturnUrl } from '../portal/redirect';
import { useProductOrigin } from '../portal/RuntimeClerkProvider';

export default function PortalOauthGooglePage() {
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
  const { isLoaded: clerkLoaded } = useAuth();
  const messages = documentPortalMessages();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current || error) return;
    if (!clerkLoaded) return;
    if (hasClerkOAuthReturn(params, window.location.hash)) {
      started.current = true;
      window.location.replace(
        `/oauth/google/callback${window.location.search}${window.location.hash}`,
      );
      return;
    }
    if (clerk.session) {
      started.current = true;
      window.location.replace(`/login?${new URLSearchParams({ return_url: returnUrl })}`);
      return;
    }
    const query = new URLSearchParams({ return_url: returnUrl }).toString();
    const client = clerk.client;
    if (!client) return;
    // An unfinished email attempt makes Clerk SSO return without navigating.
    // Read the new resource after reset; hook resources can retain the old attempt.
    client.resetSignIn();
    started.current = true;
    void startGoogleOAuth(client.signIn, window.location.origin, query)
      .then(({ error: failure }) => {
        if (failure) setError(true);
      })
      .catch(() => setError(true));
  }, [clerk, clerkLoaded, error, params, returnUrl]);

  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-4">
        <AuthNotice error={error}>{error ? messages.startFailed : messages.starting}</AuthNotice>
        {error && (
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            {messages.retry}
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
