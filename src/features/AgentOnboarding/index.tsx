'use client';

import { DEFAULT_INBOX_TITLE } from '@orvilo/const';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { createStaticStyles } from 'antd-style';
import { Loader2, RefreshCw, TerminalIcon } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { ProductLogo } from '@/components/Branding';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import LocalHarnessSection from '@/features/ChatInput/ActionBar/Agent/LocalHarnessSection';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
  firstPrimeAgentConfig,
  verifyFirstAgentDevice,
} from '@/services/agentOnboarding';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { providerBindingService } from '@/services/providerBinding';
import { useAgentStore } from '@/store/agent';
import { useProviderBindingStore } from '@/store/providerBinding';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import ApiAgentSetup from './ApiAgentSetup';
import { collectInstalledHarnessTypes, isBuiltinAgentUsable } from './availability';
import FirstAgentDeviceChoice from './FirstAgentDeviceChoice';
import { useAgentAvailability } from './useAgentAvailability';

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
  const bindings = useProviderBindingStore((s) => s.bindings);
  const [apiSetup, setApiSetup] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>();
  const createdPrime = useRef<{ agentId: string; deviceId: string } | undefined>(undefined);
  const primeCreation = useRef<FirstAgentCreationCheckpoint>({ requestId: crypto.randomUUID() });
  const cliCreation = useRef<FirstAgentCreationCheckpoint>({ requestId: crypto.randomUUID() });
  const [deviceId, setDeviceId] = useState<string | undefined>(
    useUserStore.getState().onboarding?.setup?.firstAgentDeviceId,
  );
  const createAgent = useAgentStore((s) => s.createAgent);
  const selectDevice = (selectedDeviceId: string) => {
    setDeviceId(selectedDeviceId);
    const state = useUserStore.getState();
    void state
      .updateOnboarding({
        setup: { ...state.onboarding?.setup, firstAgentDeviceId: selectedDeviceId },
      })
      .catch(setCreateError);
  };
  const completeAgent = async (
    agentId: string,
    selectedDeviceId?: string,
    executionTarget: 'device' | 'local' = 'device',
  ) => {
    setDeviceId(selectedDeviceId);
    const state = useUserStore.getState();
    await state.updateOnboarding({
      setup: {
        ...state.onboarding?.setup,
        firstAgentId: agentId,
        firstAgentDeviceId: selectedDeviceId,
        firstAgentExecutionTarget: executionTarget,
      },
    });
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
    void verifyFirstAgentDevice(deviceId)
      .then((device) => {
        openConnectAgentModal({
          initialType: type,
          initialTarget: { kind: 'device', device },
          creationCheckpoint: cliCreation.current,
          visibility: 'private',
          onCreated: (agentId, config) =>
            completeAgent(
              agentId,
              config?.agencyConfig?.boundDeviceId,
              config?.agencyConfig?.executionTarget === 'local' ? 'local' : 'device',
            ),
        });
      })
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
      <FirstAgentDeviceChoice deviceId={deviceId} onSelect={selectDevice} />
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
            ) : (
              <div className="p-4 text-sm">{t('onboarding.device.title')}</div>
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

/** Block until authoritative reads confirm a persisted configured agent. */
const AgentOnboarding = ({ children }: AgentOnboardingProps) => {
  const { availability, ready, error, retry, retrying } = useAgentAvailability();
  const isLogin = useUserStore(authSelectors.isLogin);
  if (!isLogin) return <>{children}</>;
  if (error !== undefined)
    return <AsyncError error={error} retrying={retrying} onRetry={() => void retry()} />;
  if (!ready)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  if (availability.usable) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-8">
      <OnboardingBody builtinUsable={availability.builtinUsable} retry={retry} />
    </div>
  );
};

export default AgentOnboarding;
