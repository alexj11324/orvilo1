'use client';

import { DEFAULT_INBOX_TITLE } from '@orvilo/const';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { createStaticStyles } from 'antd-style';
import { Loader2, RefreshCw, TerminalIcon } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { ProductLogo } from '@/components/Branding';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import LocalHarnessSection from '@/features/ChatInput/ActionBar/Agent/LocalHarnessSection';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { type ScanTarget, useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import {
  openNewConversation,
  selectAgentForConversation,
} from '@/features/Conversation/selectAgent';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
  firstPrimeAgentConfig,
  verifyFirstAgentDevice,
} from '@/services/agentOnboarding';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { providerBindingService } from '@/services/providerBinding';
import { useAgentStore } from '@/store/agent';
import { useElectronStore } from '@/store/electron';
import { useProviderBindingStore } from '@/store/providerBinding';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import ApiAgentSetup from './ApiAgentSetup';
import { collectInstalledHarnessTypes, isBuiltinAgentUsable } from './availability';
import { isFirstAgentSetupPath } from './setupPath';
import { useAgentAvailability } from './useAgentAvailability';
import { useFirstAgentDevice } from './useFirstAgentDevice';

const styles = createStaticStyles(({ css, cssVar }) => ({
  brand: css`
    display: flex;
    justify-content: center;
  `,
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    padding-block: 8px;
    padding-inline: 16px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  divider: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
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
  option: css`
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 18px;
  `,
  optionIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 40px;
    height: 40px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  optionText: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 3px;

    min-width: 0;
  `,
  root: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  `,
  scanHint: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;

    padding-block: 32px;

    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
  subtitle: css`
    font-size: 12px;
    line-height: 18px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    font-size: 20px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  unavailable: css`
    display: flex;
    gap: 6px;
    align-items: center;

    font-size: 12px;
    color: ${cssVar.colorWarning};
  `,
}));

const HarnessOption = memo<{
  action: ReactNode;
  icon: ReactNode;
  subtitle: ReactNode;
  title: string;
}>(({ action, icon, subtitle, title }) => (
  <div className={styles.option}>
    <span className={styles.optionIcon}>{icon}</span>
    <div className={styles.optionText}>
      <div className="font-medium">{title}</div>
      {subtitle}
    </div>
    {action}
  </div>
));

HarnessOption.displayName = 'HarnessOption';

/**
 * What the machine-side probe found. This is the only scan the screen runs, and
 * it decides its own shape: anything installed turns the screen into "pick one
 * of these and connect it", nothing installed turns it into a two-step empty
 * state that still offers a real next action instead of a dead end.
 */
const OnboardingBody = ({
  builtinUsable,
  retry,
}: {
  builtinUsable: boolean;
  retry: () => Promise<void>;
}) => {
  const { t } = useTranslation('chat');
  const { scan, state } = useAgentScan();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const bindings = useProviderBindingStore((s) => s.bindings);
  const [apiSetup, setApiSetup] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>();
  const createdPrime = useRef<{ agentId: string; deviceId: string } | undefined>(undefined);
  const primeCreation = useRef<FirstAgentCreationCheckpoint>({ requestId: crypto.randomUUID() });
  const cliCreation = useRef<FirstAgentCreationCheckpoint>({ requestId: crypto.randomUUID() });
  // The execution host resolves itself (this computer, then a persisted pick,
  // then the first online personal device); choosing a device is an advanced
  // concern that lives in Settings → Devices, not in onboarding.
  const { deviceId, isLocalDevice, loading: loadingDevice } = useFirstAgentDevice();
  const createAgent = useAgentStore((s) => s.createAgent);
  const completeAgent = async (
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
  };
  const createPrime = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      if (!deviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
      await verifyFirstAgentDevice(deviceId);
      if (!createdPrime.current) {
        const binding = bindings.find((item) => isBuiltinAgentUsable([item]));
        if (!binding) throw new Error('PROVIDER_CHECK_UNAVAILABLE');
        const check = await providerBindingService.checkConnection(binding.id, binding.revision);
        if (check.status !== 'ready') throw new Error('PROVIDER_CHECK_UNAVAILABLE');
        const result = await createOnboardingAgentOnce(
          primeCreation.current,
          {
            config: firstPrimeAgentConfig(binding.model, deviceId),
            visibility: 'private',
          },
          createAgent,
        );
        const savedDeviceId = result.config?.agencyConfig?.boundDeviceId;
        if (!savedDeviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        createdPrime.current = { agentId: result.agentId, deviceId: savedDeviceId };
      }
      await completeAgent(createdPrime.current!.agentId, createdPrime.current!.deviceId);
    } catch (error) {
      setCreateError(error);
    } finally {
      setCreating(false);
    }
  };
  const builtinOption = (
    <HarnessOption
      icon={<ProductLogo size={20} type="mono" />}
      title={DEFAULT_INBOX_TITLE}
      action={
        <Button
          disabled={creating || !deviceId}
          loading={creating}
          size="sm"
          onClick={() => (builtinUsable ? void createPrime() : setApiSetup(true))}
        >
          {t(builtinUsable ? 'onboarding.prime.create' : 'onboarding.api.configure')}
        </Button>
      }
      subtitle={
        <div className={styles.subtitle}>
          {t(builtinUsable ? 'onboarding.prime.ready' : 'onboarding.prime.unavailable')}
        </div>
      }
    />
  );

  useEffect(() => {
    if (!heterogeneousAgentService.supportsLocalExecution) return;
    void scan({ kind: 'local' });
  }, [scan]);

  const rescan = useCallback(() => {
    if (!heterogeneousAgentService.supportsLocalExecution) return;
    void scan({ kind: 'local' });
  }, [scan]);

  const connect = (type?: HeterogeneousAgentType) => {
    if (!deviceId) return;
    setCreateError(undefined);
    const open = (initialTarget: ScanTarget) =>
      openConnectAgentModal({
        initialType: type,
        initialTarget,
        creationCheckpoint: cliCreation.current,
        visibility: 'private',
        onCreated: (agentId, config) =>
          completeAgent(
            agentId,
            config?.agencyConfig?.boundDeviceId,
            config?.agencyConfig?.executionTarget === 'local' ? 'local' : 'device',
          ),
      });
    // This computer is the wizard's `local` target, not a device row: opening
    // it as `kind:'device'` asks the workspace device RPC to scan a personal
    // machine and comes back "Workspace device not found".
    if (isLocalDevice) {
      open({ kind: 'local' });
      return;
    }
    void verifyFirstAgentDevice(deviceId)
      .then((device) => open({ device, kind: 'device' }))
      .catch(setCreateError);
  };

  // `idle` is the first paint before the mount effect fires. Only the local
  // branch runs here, and `scanLocal` catches every provider, so `error` is
  // unreachable — same reasoning as the note on that status in
  // `LocalHarnessSection`.
  const scanning =
    heterogeneousAgentService.supportsLocalExecution &&
    (state.status === 'idle' || state.status === 'scanning');
  const installedCount = collectInstalledHarnessTypes(state.agents).size;
  // The empty state is a real fork in the road, not "no data": it says what was
  // looked for and offers both ways out, so the subtitle has to come with it.
  const empty = !scanning && installedCount === 0;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.brand}>
          <ProductLogo size={28} type={'mono'} />
        </span>
        <div className={styles.title}>
          {empty ? t('onboarding.emptyTitle') : t('onboarding.title')}
        </div>
        {empty && <div className={styles.subtitle}>{t('onboarding.emptyDesc')}</div>}
      </div>

      <Button disabled={!deviceId} variant="outline" onClick={() => connect()}>
        <TerminalIcon size={16} />
        {t('onboarding.connect')}
      </Button>
      {scanning ? (
        <div className={styles.card}>
          <div className={styles.scanHint}>
            <Loader2 className="animate-spin" size={14} />
            {t('localHarness.scanning')}
          </div>
        </div>
      ) : installedCount > 0 ? (
        <>
          <div className={styles.card}>
            {deviceId ? (
              <LocalHarnessSection onConnect={connect} />
            ) : loadingDevice ? (
              <div className={styles.scanHint}>
                <Loader2 className="animate-spin" size={14} />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 p-4">
                <p className="text-sm">{t('onboarding.device.empty')}</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/settings/devices')}>
                  {t('onboarding.device.connect')}
                </Button>
              </div>
            )}
          </div>
          <div className={styles.card}>
            <div className={styles.cardHeader}>{t('onboarding.builtin.group')}</div>
            {builtinOption}
          </div>
        </>
      ) : heterogeneousAgentService.supportsLocalExecution ? (
        <div className={styles.card}>
          <HarnessOption
            icon={<TerminalIcon size={20} />}
            title={t('onboarding.installCli.title')}
            action={
              <Button size={'sm'} variant={'outline'} onClick={rescan}>
                <RefreshCw data-icon="inline-start" size={13} />
                {t('onboarding.rescan')}
              </Button>
            }
            subtitle={
              <>
                <div className={styles.subtitle}>{t('onboarding.installCli.desc')}</div>
                <div className={styles.subtitle}>{t('onboarding.installCli.hint')}</div>
              </>
            }
          />
        </div>
      ) : null}

      {installedCount === 0 && <div className={styles.card}>{builtinOption}</div>}
      {createError !== undefined && (
        <AsyncError error={createError} retrying={creating} onRetry={() => void createPrime()} />
      )}
      {apiSetup && <ApiAgentSetup deviceId={deviceId} onCreated={completeAgent} />}
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
  if (!isLogin || isFirstAgentSetupPath(pathname)) return <>{children}</>;

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
  return cover(<OnboardingBody builtinUsable={availability.builtinUsable} retry={retry} />);
};

export default AgentOnboarding;
