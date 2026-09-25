'use client';

import { memo, type PropsWithChildren, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import { isDesktop } from '@/const/version';
import OnboardingContainer from '@/features/DesktopOnboarding/Layout';
import LoginStep from '@/features/DesktopOnboarding/steps/LoginStep';
import { useElectronStore } from '@/store/electron';

/**
 * Desktop shell adapter for the unified `/onboarding` flow.
 *
 * The shared wizard assumes an authenticated session; on Electron that session
 * exists only once a remote server is connected (`dataSyncConfig.active`). A
 * signed-out desktop client therefore sees the same login surface the retired
 * `/desktop-onboarding` flow used — the system-browser OIDC round trip — before
 * the shared wizard mounts. Web renders children untouched.
 *
 * When authorization lands the page reloads so the whole bootstrap (user
 * state, onboarding completion, remote config) re-reads with credentials —
 * the same hard restart the old desktop flow used after login.
 */
const DesktopAuthGate = memo<PropsWithChildren>(({ children }) => {
  const navigate = useNavigate();
  const [isInitRemoteServerConfig, dataSyncConfig, useDataSyncConfig] = useElectronStore((s) => [
    s.isInitRemoteServerConfig,
    s.dataSyncConfig,
    s.useDataSyncConfig,
  ]);
  const wasAuthenticated = useRef<boolean | undefined>(undefined);

  useDataSyncConfig();

  const isAuthenticated = !!dataSyncConfig?.active;

  useEffect(() => {
    if (!isInitRemoteServerConfig) return;

    // Only reload on the signed-out → signed-in transition inside this page —
    // a boot that already had a session mounts the wizard straight away.
    if (wasAuthenticated.current === false && isAuthenticated) {
      window.location.reload();
      return;
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, isInitRemoteServerConfig]);

  if (!isDesktop) return children;

  // Every desktop state — remote-config loading, the signed-out login step,
  // and the authenticated shared wizard alike — lives inside
  // `OnboardingContainer`: the frameless (`frame: false`) onboarding window
  // always needs its draggable title bar and Linux window controls.
  return (
    <OnboardingContainer showHeader={!isAuthenticated}>
      {!isInitRemoteServerConfig ? (
        <Loading debugId="DesktopAuthGate" />
      ) : isAuthenticated ? (
        children
      ) : (
        <LoginStep
          mode="onboarding"
          onBack={() => navigate('/')}
          onNext={() => window.location.reload()}
        />
      )}
    </OnboardingContainer>
  );
});

DesktopAuthGate.displayName = 'DesktopAuthGate';

export default DesktopAuthGate;
