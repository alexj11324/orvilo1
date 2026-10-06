'use client';

import { createStaticStyles } from 'antd-style';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { ProductLogo } from '@/components/Branding';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  openNewConversation,
  selectAgentForConversation,
} from '@/features/Conversation/selectAgent';
import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useElectronStore } from '@/store/electron';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { isFirstAgentSetupPath } from './setupPath';
import { useAgentAvailability } from './useAgentAvailability';

const styles = createStaticStyles(({ css, cssVar }) => ({
  brand: css`
    display: flex;
    justify-content: center;
  `,
  footer: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  header: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;

    text-align: center;
  `,
  root: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  `,
  title: css`
    font-size: 20px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

/**
 * What the machine-side probe found is rendered inside the create panel — the
 * gate keeps only the page title, the account escape and the onboarding
 * bookkeeping around it.
 */
const OnboardingBody = ({ retry }: { retry: () => Promise<void> }) => {
  const { t } = useTranslation('chat');
  // Plain useNavigate resolves the root router; on Electron page content lives
  // in per-tab routers, so a gated user's settings buttons would be dead
  // clicks. The workspace-aware navigator drives the tab router there.
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useLocation();

  const completeAgent = useCallback(
    async (
      agentId: string,
      selectedDeviceId?: string,
      executionTarget: 'device' | 'local' = 'device',
    ) => {
      const state = useUserStore.getState();
      await state.updateOnboarding({
        setup: {
          ...state.onboarding?.setup,
          firstAgentId: agentId,
          firstAgentDeviceId: selectedDeviceId,
          firstAgentExecutionTarget: executionTarget,
        },
      });
      // The agent just created is where the user lands when the gate releases.
      // Inside the account wizard the finish step owns the navigation instead —
      // it selects the same agent and goes to the post-onboarding target.
      if (pathname === '/onboarding') {
        selectAgentForConversation(agentId);
      } else {
        openNewConversation({ agentId });
      }
      await retry();
    },
    [pathname, retry],
  );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.brand}>
          <ProductLogo size={28} type={'mono'} />
        </span>
        <div className={styles.title}>{t('onboarding.title')}</div>
      </div>
      <CreateAgentPanel
        lockVisibility
        onCreated={(agentId, config) =>
          completeAgent(
            agentId,
            config?.agencyConfig?.boundDeviceId,
            config?.agencyConfig?.executionTarget === 'local' ? 'local' : 'device',
          )
        }
      />
      <div className={styles.footer}>{t('onboarding.footerHint')}</div>
      <Button variant="ghost" onClick={() => navigate('/settings/profile')}>
        {t('onboarding.account')}
      </Button>
    </div>
  );
};

interface AgentOnboardingProps {
  /** The landing this screen replaces once it decides nothing can run. */
  children: ReactNode;
}

/**
 * First-agent gate, mounted at the (main)/(mobile) layouts: until an
 * authoritative read confirms a usable agent, the setup screen covers the
 * whole app window — sidebar, title area and every page included — because
 * nothing else can run yet. Setup paths (provider/credential/device settings)
 * stay reachable: they are exactly where a blocked user goes to fix the
 * missing piece.
 */
const AgentOnboarding = ({ children }: AgentOnboardingProps) => {
  const location = useLocation();
  // On Electron the window URL is a one-way mirror of the active tab: the
  // root router location this hook returns can sit on a settings path while
  // the tab the user is actually looking at renders a normal page, which
  // would release the gate app-wide. The electron store's active-tab URL is
  // authoritative there; everywhere else (it is empty on web) the router
  // location is.
  const activeTabUrl = useElectronStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.url ?? null,
  );
  const pathname = activeTabUrl?.split(/[?#]/)[0] ?? location.pathname;
  const { availability, ready, error, retry, retrying } = useAgentAvailability();
  const isLogin = useUserStore(authSelectors.isLogin);
  if (
    !isLogin ||
    location.pathname === '/onboarding' ||
    pathname === '/onboarding' ||
    isFirstAgentSetupPath(pathname)
  )
    return <>{children}</>;

  const cover = (content: ReactNode) => (
    <>
      {children}
      {/* z-50 clears the shell chrome (sidebar sits at z-10) but stays under
          modal/toast layers so dialogs opened from the flow still interact. */}
      <div className="fixed inset-0 z-50 overflow-auto bg-background">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-6 py-8">
          {content}
        </div>
      </div>
    </>
  );

  if (error !== undefined)
    return cover(<AsyncError error={error} retrying={retrying} onRetry={() => void retry()} />);
  if (!ready)
    return cover(
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>,
    );
  if (availability.usable) return <>{children}</>;
  return cover(<OnboardingBody retry={retry} />);
};

export default AgentOnboarding;
