'use client';

import '@/app/globals.css';

import { Alert } from '@lobehub/ui/base-ui';
import { type AuthorizationPhase, type AuthorizationProgress } from '@orvilo/electron-client-ipc';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { ArrowLeft, ArrowRight, Cloud, ExternalLink, LogOutIcon, Server } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { OFFICIAL_SITE } from '@/const/url';
import { isDesktop } from '@/const/version';
import UserInfo from '@/features/User/UserInfo';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';
import { useSignOut } from '@/hooks/useSignOut';
import { remoteServerService } from '@/services/electron/remoteServer';
import { electronSystemService } from '@/services/electron/system';
import { useElectronStore } from '@/store/electron';
import { setDesktopAutoOidcFirstOpenHandled } from '@/utils/electron/autoOidc';

const LEGACY_LOCAL_DB_MIGRATION_GUIDE_URL = urlJoin(
  OFFICIAL_SITE,
  '/docs/usage/migrate-from-local-database',
);

// Login method type
type LoginMethod = 'cloud' | 'selfhost';

// Login status type
type LoginStatus = 'idle' | 'loading' | 'success' | 'error';

const authorizationPhaseI18nKeyMap: Record<AuthorizationPhase, string> = {
  browser_opened: 'screen5.auth.phase.browserOpened',
  cancelled: 'screen5.actions.cancel',
  verifying: 'screen5.auth.phase.verifying',
  waiting_for_auth: 'screen5.auth.phase.waitingForAuth',
};

// `status` hosts render this step as a connection panel for already-signed-in users,
// where the wizard's "back" and "next" have no meaning.
type LoginStepMode = 'onboarding' | 'status';

interface LoginStepProps {
  mode?: LoginStepMode;
  onBack: () => void;
  onNext: () => void;
}

const LoginStep = memo<LoginStepProps>(({ mode = 'onboarding', onBack, onNext }) => {
  const { t } = useTranslation('desktop-onboarding');
  const [endpoint, setEndpoint] = useState('');
  const [cloudLoginStatus, setCloudLoginStatus] = useState<LoginStatus>('idle');
  const [authProgress, setAuthProgress] = useState<AuthorizationProgress | null>(null);
  const [selfhostLoginStatus, setSelfhostLoginStatus] = useState<LoginStatus>('idle');
  const [pendingLoginMethod, setPendingLoginMethod] = useState<LoginMethod | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [showEndpoint, setShowEndpoint] = useState(false);
  const [hasLegacyLocalDb, setHasLegacyLocalDb] = useState(false);
  const [localRemainingSeconds, setLocalRemainingSeconds] = useState<number | null>(null);
  const { compositionProps, isComposingRef } = useIMECompositionEvent();

  const [
    dataSyncConfig,
    isConnectingServer,
    remoteServerSyncError,
    useDataSyncConfig,
    connectRemoteServer,
    refreshServerConfig,
    clearRemoteServerSyncError,
  ] = useElectronStore((s) => [
    s.dataSyncConfig,
    s.isConnectingServer,
    s.remoteServerSyncError,
    s.useDataSyncConfig,
    s.connectRemoteServer,
    s.refreshServerConfig,
    s.clearRemoteServerSyncError,
  ]);

  const signOut = useSignOut();

  useDataSyncConfig();

  useEffect(() => {
    if (!isDesktop) return;

    let mounted = true;
    electronSystemService
      .hasLegacyLocalDb()
      .then((value) => {
        if (mounted) setHasLegacyLocalDb(value);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const isCloudAuthed = !!dataSyncConfig?.active && dataSyncConfig.storageMode === 'cloud';
  const isSelfHostAuthed = !!dataSyncConfig?.active && dataSyncConfig.storageMode === 'selfHost';
  const authorizedLoginMethod: LoginMethod | null = isCloudAuthed
    ? 'cloud'
    : isSelfHostAuthed
      ? 'selfhost'
      : null;
  const isSelfHostEndpointVerified =
    isSelfHostAuthed &&
    !!endpoint.trim() &&
    endpoint.trim() === (dataSyncConfig?.remoteServerUrl ?? '');

  const statusSuccessLoginMethod: LoginMethod | null =
    cloudLoginStatus === 'success' && selfhostLoginStatus === 'success'
      ? (pendingLoginMethod ?? authorizedLoginMethod)
      : cloudLoginStatus === 'success'
        ? 'cloud'
        : selfhostLoginStatus === 'success'
          ? 'selfhost'
          : null;
  const hasLocalLoginResult = cloudLoginStatus !== 'idle' || selfhostLoginStatus !== 'idle';

  const successLoginMethod =
    statusSuccessLoginMethod ??
    (!hasLocalLoginResult && !pendingLoginMethod ? authorizedLoginMethod : null);

  // Handle cloud login
  const handleCloudLogin = async () => {
    if (!isDesktop) {
      setRemoteError(t('screen5.errors.desktopOnlyOidc'));
      setCloudLoginStatus('error');
      return;
    }

    setRemoteError(null);
    clearRemoteServerSyncError();
    setPendingLoginMethod('cloud');
    setCloudLoginStatus('loading');
    setSelfhostLoginStatus('idle');
    setDesktopAutoOidcFirstOpenHandled();
    await connectRemoteServer({
      remoteServerUrl: dataSyncConfig?.remoteServerUrl,
      storageMode: 'cloud',
    });
  };

  // Handle self-hosted server connection
  const handleSelfhostConnect = async () => {
    if (!isDesktop) {
      setRemoteError(t('screen5.errors.desktopOnlyOidc'));
      setSelfhostLoginStatus('error');
      return;
    }

    const url = endpoint.trim();
    if (!url) return;

    setRemoteError(null);
    clearRemoteServerSyncError();
    setPendingLoginMethod('selfhost');
    setCloudLoginStatus('idle');
    setSelfhostLoginStatus('loading');
    await connectRemoteServer({ remoteServerUrl: url, storageMode: 'selfHost' });
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  // Sync local UI status with real remote config
  useEffect(() => {
    if (isCloudAuthed) {
      setCloudLoginStatus('success');
      setSelfhostLoginStatus('idle');
      setPendingLoginMethod(null);
    } else if (isSelfHostAuthed) {
      setSelfhostLoginStatus('success');
      setCloudLoginStatus('idle');
      setPendingLoginMethod(null);
    }
  }, [isCloudAuthed, isSelfHostAuthed]);

  useEffect(() => {
    if (!isSelfHostAuthed || endpoint.trim()) return;
    setEndpoint(dataSyncConfig?.remoteServerUrl ?? '');
  }, [dataSyncConfig?.remoteServerUrl, endpoint, isSelfHostAuthed]);

  // If user changes self-host endpoint after success, require re-authorization.
  useEffect(() => {
    if (selfhostLoginStatus !== 'success') return;
    if (isSelfHostEndpointVerified) return;
    setSelfhostLoginStatus('idle');
  }, [isSelfHostEndpointVerified, selfhostLoginStatus]);

  // Surface requestAuthorization errors reported via store
  useEffect(() => {
    const message = remoteServerSyncError?.message;
    if (!message) return;
    setRemoteError(message);
    setPendingLoginMethod(null);
    if (cloudLoginStatus === 'loading') setCloudLoginStatus('error');
    if (selfhostLoginStatus === 'loading') setSelfhostLoginStatus('error');
  }, [remoteServerSyncError?.message, cloudLoginStatus, selfhostLoginStatus]);

  // Watch broadcasts from main process (polling result)
  useWatchBroadcast('authorizationSuccessful', async () => {
    setRemoteError(null);
    clearRemoteServerSyncError();
    setAuthProgress(null);
    if (pendingLoginMethod === 'cloud') {
      setCloudLoginStatus('success');
      setSelfhostLoginStatus('idle');
    } else if (pendingLoginMethod === 'selfhost') {
      setSelfhostLoginStatus('success');
      setCloudLoginStatus('idle');
    }
    setPendingLoginMethod(null);
    await refreshServerConfig();
  });

  useWatchBroadcast('authorizationFailed', ({ error }) => {
    setRemoteError(error);
    setAuthProgress(null);
    setPendingLoginMethod(null);
    if (cloudLoginStatus === 'loading') setCloudLoginStatus('error');
    if (selfhostLoginStatus === 'loading') setSelfhostLoginStatus('error');
  });

  useWatchBroadcast('authorizationProgress', (progress) => {
    setAuthProgress(progress);
    if (progress.phase === 'cancelled') {
      setCloudLoginStatus('idle');
      setSelfhostLoginStatus('idle');
      setPendingLoginMethod(null);
      setAuthProgress(null);
    }
  });

  // Sync local countdown from authProgress
  useEffect(() => {
    if (authProgress) {
      const seconds = Math.max(
        0,
        Math.ceil((authProgress.maxPollTime - authProgress.elapsed) / 1000),
      );
      setLocalRemainingSeconds(seconds);
    } else {
      setLocalRemainingSeconds(null);
    }
  }, [authProgress]);

  // Decrement local countdown every second for smooth UI updates
  useEffect(() => {
    if (localRemainingSeconds === null || localRemainingSeconds <= 0) return;

    const timer = setTimeout(() => {
      setLocalRemainingSeconds((prev) => {
        if (prev === null || prev <= 0) return prev;
        return prev - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [localRemainingSeconds]);

  const handleCancelAuth = async () => {
    setRemoteError(null);
    clearRemoteServerSyncError();

    setCloudLoginStatus('idle');
    setSelfhostLoginStatus('idle');
    setPendingLoginMethod(null);
    setAuthProgress(null);
    await remoteServerService.cancelAuthorization();
  };

  if (successLoginMethod) {
    const isStatusMode = mode === 'status';
    const serverUrl = dataSyncConfig?.remoteServerUrl;
    const title =
      successLoginMethod === 'cloud'
        ? t('screen5.status.cloud.title')
        : t('screen5.status.selfhost.title');
    const description =
      successLoginMethod === 'selfhost' && serverUrl
        ? t('screen5.status.selfhost.description', { url: serverUrl })
        : t('screen5.status.description');

    return (
      <section className="orvilo-entry-surface text-foreground mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm leading-6">{description}</p>
        </div>
        <UserInfo />
        <div className="flex items-center justify-between gap-4">
          {isStatusMode ? (
            <Button disabled={isSigningOut} variant="ghost" onClick={handleSignOut}>
              {isSigningOut ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LogOutIcon data-icon="inline-start" />
              )}
              {isSigningOut ? t('screen5.actions.signingOut') : t('screen5.actions.signOut')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              {t('back')}
            </Button>
          )}
          <Button onClick={onNext}>
            {isStatusMode ? t('screen5.actions.done') : t('next')}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>
    );
  }

  const busy = cloudLoginStatus === 'loading' || selfhostLoginStatus === 'loading';
  const failed = cloudLoginStatus === 'error' || selfhostLoginStatus === 'error';
  const errorMessage = remoteError?.toLowerCase().includes('timed out')
    ? t('screen5.errors.timedOut')
    : remoteError || t('authResult.failed.desc');

  return (
    <section className="orvilo-entry-surface text-foreground mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {showEndpoint ? t('screen5.entry.serverTitle') : t('screen5.entry.title')}
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          {showEndpoint
            ? t('screen5.methods.selfhost.description')
            : t('screen5.entry.description')}
        </p>
      </div>

      {failed && (
        <Alert description={errorMessage} title={t('authResult.failed.title')} type="error" />
      )}

      {showEndpoint ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isComposingRef.current && endpoint.trim() && !busy && !isConnectingServer) {
              void handleSelfhostConnect();
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="orvilo-server-url">
                {t('screen5.selfhost.endpointLabel')}
              </FieldLabel>
              <Input
                autoCapitalize="none"
                autoComplete="url"
                className="h-10"
                disabled={busy || isConnectingServer}
                id="orvilo-server-url"
                inputMode="url"
                placeholder={t('screen5.selfhost.endpointPlaceholder')}
                spellCheck={false}
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                {...compositionProps}
                onContextMenu={async (event) => {
                  if (!isDesktop) return;
                  event.preventDefault();
                  const input = event.target as HTMLInputElement;
                  const selectionText = input.value.slice(
                    input.selectionStart || 0,
                    input.selectionEnd || 0,
                  );
                  await electronSystemService.showContextMenu('editor', {
                    selectionText: selectionText || undefined,
                  });
                }}
              />
              <FieldDescription>{t('screen5.entry.browserHint')}</FieldDescription>
            </Field>
          </FieldGroup>
          <Button
            className="w-full"
            disabled={!endpoint.trim() || busy || isConnectingServer}
            size="lg"
            type="submit"
          >
            {selfhostLoginStatus === 'loading' ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Server data-icon="inline-start" />
            )}
            {selfhostLoginStatus === 'loading'
              ? t('screen5.actions.connecting')
              : selfhostLoginStatus === 'error'
                ? t('screen5.actions.tryAgain')
                : t('screen5.actions.connectToServer')}
          </Button>
          <Button
            disabled={busy || isConnectingServer}
            type="button"
            variant="ghost"
            onClick={() => {
              setShowEndpoint(false);
              setSelfhostLoginStatus('idle');
              setRemoteError(null);
              clearRemoteServerSyncError();
            }}
          >
            <ArrowLeft data-icon="inline-start" />
            {t('back')}
          </Button>
        </form>
      ) : (
        <>
          <Button
            className="w-full"
            disabled={busy || isConnectingServer}
            size="lg"
            onClick={handleCloudLogin}
          >
            {cloudLoginStatus === 'loading' ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Cloud data-icon="inline-start" />
            )}
            {cloudLoginStatus === 'loading'
              ? t('screen5.actions.signingIn')
              : cloudLoginStatus === 'error'
                ? t('screen5.actions.tryAgain')
                : t('screen5.actions.signInCloud')}
            {!busy && <ExternalLink data-icon="inline-end" />}
          </Button>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">{t('screen5.entry.or')}</span>
            <Separator className="flex-1" />
          </div>
          <Button
            className="w-full"
            disabled={busy || isConnectingServer}
            size="lg"
            variant="outline"
            onClick={() => {
              setShowEndpoint(true);
              setCloudLoginStatus('idle');
              setRemoteError(null);
              clearRemoteServerSyncError();
            }}
          >
            <Server data-icon="inline-start" />
            {t('screen5.entry.selfhostAction')}
          </Button>
          {!busy && (
            <p className="text-muted-foreground text-center text-xs leading-5">
              {t('screen5.entry.browserHint')}
            </p>
          )}
        </>
      )}

      {busy && (
        <div
          aria-live="polite"
          className="text-muted-foreground flex flex-col gap-2 text-sm"
          role="status"
        >
          <p>{t(authorizationPhaseI18nKeyMap[authProgress?.phase ?? 'browser_opened'])}</p>
          <div className="flex items-center justify-between gap-4">
            {localRemainingSeconds !== null && (
              <span>{t('screen5.auth.remaining', { time: localRemainingSeconds })}</span>
            )}
            <Button size="sm" variant="ghost" onClick={handleCancelAuth}>
              {t('screen5.actions.cancel')}
            </Button>
          </div>
        </div>
      )}
      {hasLegacyLocalDb && (
        <Button
          variant="link"
          onClick={() =>
            electronSystemService.openExternalLink(LEGACY_LOCAL_DB_MIGRATION_GUIDE_URL)
          }
        >
          {t('screen5.legacyLocalDb.link')}
        </Button>
      )}
    </section>
  );
});

LoginStep.displayName = 'LoginStep';

export default LoginStep;
