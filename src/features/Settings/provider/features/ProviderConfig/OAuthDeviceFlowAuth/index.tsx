'use client';

import { CircleCheckIcon, LogOutIcon, UnplugIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import CopyButton from '@/components/CopyButton';
import { confirmModal, Modal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/hooks/usePermission';
import { lambdaQuery } from '@/libs/trpc/client';

import { useOAuthDeviceFlow } from './useOAuthDeviceFlow';

const styles = {
  card: 'w-full max-w-256 overflow-hidden rounded-(--radius-card) border border-divider',
  codeBox:
    'flex flex-1 items-center justify-center rounded-(--radius-card) bg-accent px-6 py-4 font-mono text-base leading-6 font-semibold tracking-normal',
  content: 'flex flex-col items-center gap-4 pbs-2 pbe-1 text-sm leading-5.5',
  errorText: 'text-sm leading-5.5 text-destructive-text',
  header: 'flex items-center justify-between gap-3 px-4 py-3',
  hint: 'w-full text-start text-sm leading-5.5 text-muted-foreground',
  pollingHint:
    'flex items-center justify-center gap-2 rounded-(--radius-card) bg-fill-quaternary px-4 py-3 text-xs leading-5 text-muted-foreground',
  successBadge: 'flex items-center gap-1.5 text-xs leading-5 text-success-text',
  username: 'text-xs leading-5 text-muted-foreground',
};

export interface OAuthDeviceFlowAuthProps {
  /**
   * Whether the provider is switched on. The connect action only shows up once
   * the provider is enabled, so the row stays a single toggle until then.
   */
  enabled?: boolean;
  extra?: ReactNode;
  onAuthChange?: () => void;
  providerId: string;
  title?: ReactNode;
}

const OAuthDeviceFlowAuth = memo<OAuthDeviceFlowAuthProps>(
  ({ providerId, onAuthChange, title, extra, enabled }) => {
    const { t } = useTranslation('modelProvider');
    const { allowed: canManageProvider } = usePermission('manage_provider_key');
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const utils = lambdaQuery.useUtils();

    const { data: authStatus } = lambdaQuery.oauthDeviceFlow.getAuthStatus.useQuery(
      { providerId },
      { refetchOnWindowFocus: true },
    );
    const isAuthenticated = authStatus?.status === 'ACTIVE';
    const username = authStatus?.username;
    const avatarUrl = authStatus?.avatarUrl;

    const revokeAuth = lambdaQuery.oauthDeviceFlow.revokeAuth.useMutation({
      onSuccess: () => {
        utils.oauthDeviceFlow.getAuthStatus.invalidate({ providerId });
        onAuthChange?.();
      },
    });

    const handleSuccess = useCallback(async () => {
      // First invalidate and refetch the auth status
      await utils.oauthDeviceFlow.getAuthStatus.invalidate({ providerId });
      // Then notify parent and reset authenticating state
      onAuthChange?.();
      setIsAuthenticating(false);
    }, [onAuthChange, providerId, utils.oauthDeviceFlow.getAuthStatus]);

    const { state, deviceCodeInfo, error, startAuth, cancelAuth } = useOAuthDeviceFlow({
      onSuccess: handleSuccess,
      providerId,
    });

    const handleDisconnect = useCallback(() => {
      if (!canManageProvider) return;

      confirmModal({
        content: t('providerModels.config.oauth.disconnectConfirm'),
        okButtonProps: { danger: true },
        okText: t('providerModels.config.oauth.disconnect'),
        onOk: async () => {
          await revokeAuth.mutateAsync({ providerId });
        },
        title: t('providerModels.config.oauth.disconnect'),
      });
    }, [canManageProvider, providerId, revokeAuth, t]);

    const handleStartAuth = useCallback(async () => {
      if (!canManageProvider) return;
      // Retry re-enters from the dialog's error state, where isAuthenticating
      // is still true — so only a genuinely in-flight attempt blocks a restart.
      if (isAuthenticating && state !== 'error') return;

      setIsAuthenticating(true);
      const info = await startAuth();

      // Auto-open the verification page right away — the Connect click still
      // counts as transient user activation, so popup blockers normally allow
      // it. The manual "open browser" button stays as a fallback when blocked.
      const uri = info?.verificationUriComplete || info?.verificationUri;
      if (uri) window.open(uri, '_blank');
    }, [canManageProvider, isAuthenticating, startAuth, state]);

    const handleCancelAuth = useCallback(() => {
      setIsAuthenticating(false);
      cancelAuth();
    }, [cancelAuth]);

    // The inline action that trails the enable switch in the header row. The
    // device-code flow runs in a dialog, so the button stays put and spins
    // rather than being swapped out while pairing is in flight.
    const renderAction = () => {
      if (!enabled) return null;

      if (isAuthenticated)
        return (
          <>
            {username && (
              <div className="flex items-center gap-1.5">
                {avatarUrl && <Avatar avatar={avatarUrl} size={20} title={username} />}
                <span className={styles.username}>{username}</span>
              </div>
            )}
            <Button
              className="relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:top-[calc(var(--spacing)*-1.75)] pointer-coarse:after:bottom-[calc(var(--spacing)*-1.75)] pointer-coarse:after:left-[calc(var(--spacing)*-0.25)] pointer-coarse:after:right-[calc(var(--spacing)*-0.25)] pointer-coarse:after:content-['']"
              disabled={!canManageProvider}
              loading={revokeAuth.isPending}
              size="compact"
              type="button"
              variant="outline"
              onClick={handleDisconnect}
            >
              <LogOutIcon className="size-4" />
              {t('providerModels.config.oauth.disconnect')}
            </Button>
          </>
        );

      return (
        <Button
          className="relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:top-[calc(var(--spacing)*-1.75)] pointer-coarse:after:bottom-[calc(var(--spacing)*-1.75)] pointer-coarse:after:left-[calc(var(--spacing)*-0.25)] pointer-coarse:after:right-[calc(var(--spacing)*-0.25)] pointer-coarse:after:content-['']"
          disabled={!canManageProvider}
          loading={isAuthenticating}
          size="compact"
          type="button"
          variant="default"
          onClick={handleStartAuth}
        >
          {t('providerModels.config.oauth.connect')}
        </Button>
      );
    };

    // Dialog body for the device-code flow. The dialog itself owns dismissal,
    // so only the error branch needs an explicit way out.
    const renderAuthPanel = () => {
      // Loading state
      if (state === 'requesting' || !deviceCodeInfo)
        return (
          <div className={styles.content}>
            <Spinner className="size-6" />
            <span className="text-sm leading-5.5 text-muted-foreground">
              {t('providerModels.config.oauth.connecting')}
            </span>
          </div>
        );

      // Error state
      if (state === 'error' && error) {
        const errorKey = `providerModels.config.oauth.${error}`;
        return (
          <div className={styles.content}>
            <div className="flex items-center gap-2">
              <UnplugIcon className="size-4 text-destructive-text" />
              <span className={styles.errorText}>{t(errorKey as any)}</span>
            </div>
            <div className="flex w-full flex-col gap-3">
              <Button
                className="relative w-full pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:top-[calc(var(--spacing)*-1.25)] pointer-coarse:after:bottom-[calc(var(--spacing)*-1.25)] pointer-coarse:after:left-[calc(var(--spacing)*-0.25)] pointer-coarse:after:right-[calc(var(--spacing)*-0.25)] pointer-coarse:after:content-['']"
                disabled={!canManageProvider}
                size="normal"
                type="button"
                variant="default"
                onClick={handleStartAuth}
              >
                {t('providerModels.config.oauth.retry')}
              </Button>
              <Button
                className="relative w-full pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:top-[calc(var(--spacing)*-1.25)] pointer-coarse:after:bottom-[calc(var(--spacing)*-1.25)] pointer-coarse:after:left-[calc(var(--spacing)*-0.25)] pointer-coarse:after:right-[calc(var(--spacing)*-0.25)] pointer-coarse:after:content-['']"
                disabled={false}
                size="normal"
                type="button"
                variant="ghost"
                onClick={handleCancelAuth}
              >
                {t('providerModels.config.oauth.cancel')}
              </Button>
            </div>
          </div>
        );
      }

      // Device code display. The authorization page is opened for the user on
      // Connect, so the link is the fallback for when a popup blocker ate it —
      // and the only route when authorizing on a second device.
      return (
        <div className={styles.content}>
          <div className={styles.hint}>
            {t('providerModels.config.oauth.enterCode')}{' '}
            <a href={deviceCodeInfo.verificationUri} rel="noreferrer" target="_blank">
              {deviceCodeInfo.verificationUri}
            </a>
          </div>

          <div className="flex w-full items-center gap-3">
            <div className={styles.codeBox}>{deviceCodeInfo.userCode}</div>
            <CopyButton content={deviceCodeInfo.userCode} title={t('copy', { ns: 'common' })} />
          </div>

          <div className={styles.pollingHint}>
            <Spinner />
            <span>{t('providerModels.config.oauth.polling')}</span>
          </div>
        </div>
      );
    };

    return (
      <>
        <div className={styles.card}>
          <div className={styles.header}>
            {/* The badge is a property of the provider, not an action on it, so
                it sits with the name rather than among the controls. */}
            <div className="flex items-center gap-2">
              {title}
              {enabled && isAuthenticated && (
                <div className={styles.successBadge}>
                  <CircleCheckIcon className="size-4" />
                  <span>{t('providerModels.config.oauth.connected')}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {extra}
              {renderAction()}
            </div>
          </div>
        </div>
        {/* Dismissing the dialog abandons the pairing, which is what a user
            closing it means — the code is dead once we stop polling for it. */}
        <Modal
          footer={null}
          open={isAuthenticating}
          title={t('providerModels.config.oauth.title')}
          width={420}
          onCancel={handleCancelAuth}
        >
          {renderAuthPanel()}
        </Modal>
      </>
    );
  },
);

OAuthDeviceFlowAuth.displayName = 'OAuthDeviceFlowAuth';

export default OAuthDeviceFlowAuth;
