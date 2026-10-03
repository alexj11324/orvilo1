'use client';

import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { isDesktop } from '@orvilo/const';
import type {
  HeterogeneousAgentScanStatus,
  HeterogeneousAgentType,
  RemoteHeterogeneousAgentType,
} from '@orvilo/heterogeneous-agents';
import { isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import type { DeviceListItem } from '@orvilo/types';
import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { t as i18nT } from 'i18next';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Download,
  LaptopIcon,
  RefreshCw,
  ScanSearch,
  TerminalIcon,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import CommandLine from '@/components/CommandLine';
import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DOWNLOAD_URL } from '@/const/url';
import { getDeviceIcon } from '@/features/DeviceManager/getDeviceIcon';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { deviceService } from '@/services/device';
import { useAgentStore } from '@/store/agent';
import { heteroAgentDefaultName } from '@/store/agent/utils/heteroAgentDefaultName';
import { useElectronStore } from '@/store/electron';
import { useHomeStore } from '@/store/home';

import { getDeviceListState } from './deviceListState';
import type { ConnectableProvider, ConnectAgentProfile } from './providers';
import { buildConnectAgentConfig, CONNECTABLE_PROVIDERS } from './providers';
import type { ScanTarget } from './useAgentScan';
import { useAgentScan } from './useAgentScan';

const styles = createStaticStyles(({ css }) => ({
  agentListScrollbar: css`
    width: 2px;
    margin-block: 12px;
    margin-inline-end: 4px;
  `,
  agentListThumb: css`
    background: ${cssVar.colorFill};
  `,
  agentListViewport: css`
    overscroll-behavior: contain;
    max-height: min(50dvh, 400px);
  `,
  commandHint: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    min-width: 0;
    padding-inline: 4px;

    > span {
      overflow: hidden;
      min-width: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  dot: css`
    flex: none;

    width: 8px;
    height: 8px;
    border-radius: 50%;

    background: ${cssVar.colorSuccess};
  `,
  dotOff: css`
    flex: none;

    width: 8px;
    height: 8px;
    border-radius: 50%;

    background: ${cssVar.colorTextQuaternary};
  `,
  emptyCard: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  emptyHero: css`
    padding-block: 24px;
    padding-inline: 24px;
    text-align: center;
    background: ${cssVar.colorFillQuaternary};
  `,
  emptyOption: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;

    min-width: 0;
    min-height: 152px;
    padding: 18px;

    background: ${cssVar.colorBgContainer};
  `,
  emptyOptionAction: css`
    display: flex;
    align-items: center;

    width: 100%;
    min-height: 28px;
    margin-block-start: auto;

    > a,
    > div {
      width: 100%;
    }
  `,
  emptyOptions: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;

    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBorderSecondary};
  `,
  emptyOptionIcon: css`
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
  heroIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 52px;
    height: 52px;
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorText};

    background: ${cssVar.colorFillSecondary};
  `,
  groupList: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  iconBox: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillTertiary};
  `,
  mono: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  row: css`
    cursor: pointer;

    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 12px;
    padding-inline: 16px;

    transition: background 0.15s;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rowDisabled: css`
    cursor: not-allowed;
    opacity: 0.5;

    &:hover {
      background: transparent;
    }
  `,
  rowStatic: css`
    cursor: default;

    &:hover {
      background: transparent;
    }
  `,
  skeletonBar: css`
    height: 10px;
    border-radius: 5px;
    background: ${cssVar.colorFillSecondary};
    animation: orvilo-connect-agent-pulse 1.4s ease-in-out infinite;

    @keyframes orvilo-connect-agent-pulse {
      50% {
        opacity: 0.45;
      }
    }
  `,
  skeletonCircle: css`
    flex: none;

    width: 32px;
    height: 32px;
    border-radius: 50%;

    background: ${cssVar.colorFillSecondary};

    animation: orvilo-connect-agent-pulse 1.4s ease-in-out infinite;
  `,
  skeletonSquare: css`
    width: 36px;
    height: 36px;
    border-radius: ${cssVar.borderRadius};
  `,
}));

interface CreatedAgent {
  agentId: string;
  locationLabel: string;
  provider: ConnectableProvider;
  title: string;
  version?: string;
}

const SectionLabel = memo<{ children: ReactNode }>(({ children }) => (
  <div className="text-[12px] text-muted-foreground" style={{ paddingInline: 4 }}>
    {children}
  </div>
));

const SkeletonRow = memo<{ squareIcon?: boolean; width: number }>(({ squareIcon, width }) => (
  <div className={`${styles.row} ${styles.rowStatic}`}>
    <div
      className={
        squareIcon ? `${styles.skeletonCircle} ${styles.skeletonSquare}` : styles.skeletonCircle
      }
    />
    {/* Column height matches a real row's two-line text block so the
        scanning → done swap doesn't shift the modal */}
    <div className="flex flex-col flex-1 gap-2.5 justify-center" style={{ height: 42 }}>
      <div className={styles.skeletonBar} style={{ width }} />
      <div className={styles.skeletonBar} style={{ opacity: 0.6, width: width * 1.6 }} />
    </div>
  </div>
));

const ScrollableAgentList = memo<{ children: ReactNode }>(({ children }) => (
  <ScrollAreaPrimitive.Root className={styles.groupList}>
    <ScrollAreaPrimitive.Viewport className={styles.agentListViewport}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      className={cx('flex touch-none p-px select-none', styles.agentListScrollbar)}
      orientation={'vertical'}
    >
      <ScrollAreaPrimitive.Thumb
        className={cx('relative flex-1 rounded-full', styles.agentListThumb)}
      />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));

ScrollableAgentList.displayName = 'ScrollableAgentList';

const DeviceRow = memo<{
  icon: ReactNode;
  offline?: boolean;
  onClick?: () => void;
  statusText: string;
  subtitle: string;
  title: string;
}>(({ icon, offline, onClick, statusText, subtitle, title }) => (
  <div
    className={offline ? `${styles.row} ${styles.rowDisabled}` : styles.row}
    role={'button'}
    tabIndex={offline ? -1 : 0}
    onClick={offline ? undefined : onClick}
  >
    <div className={styles.iconBox}>{icon}</div>
    <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
      <div className="truncate block font-semibold">{title}</div>
      <div className="text-[12px] text-muted-foreground">{subtitle}</div>
    </div>
    <div className="flex items-center gap-1.5" style={{ flex: 'none' }}>
      <div className={offline ? styles.dotOff : styles.dot} />
      <div className="text-[12px] text-muted-foreground">{statusText}</div>
    </div>
  </div>
));

const AgentScanRow = memo<{
  onToggle: () => void;
  provider: ConnectableProvider;
  selected: boolean;
  status?: HeterogeneousAgentScanStatus;
  subtitle: string;
  unavailableText: string;
}>(({ onToggle, provider, selected, status, subtitle, unavailableText }) => {
  const available = status?.available === true;
  const row = (
    <div
      className={available ? styles.row : `${styles.row} ${styles.rowDisabled}`}
      role={'button'}
      tabIndex={available ? 0 : -1}
      onClick={available ? onToggle : undefined}
    >
      <provider.brand.Avatar size={32} />
      <div className="flex flex-col flex-1 gap-[1px]" style={{ minWidth: 0 }}>
        <div className="font-semibold">{provider.title}</div>
        <div className="truncate block text-[12px] text-muted-foreground">{subtitle}</div>
      </div>
      {available ? (
        <>
          {status?.version && <span className={styles.mono}>{status.version}</span>}
          <Checkbox checked={selected} style={{ pointerEvents: 'none' }} />
        </>
      ) : (
        <div className="text-[12px] text-muted-foreground">{unavailableText}</div>
      )}
    </div>
  );

  if (!available && status?.reason)
    return (
      <Tooltip>
        <TooltipTrigger render={<span>{row}</span>} />
        <TooltipContent>{status.reason}</TooltipContent>
      </Tooltip>
    );
  return row;
});

interface ConnectAgentContentProps {
  groupId?: string;
  onTitleChange: (title: string) => void;
  visibility?: 'private' | 'public';
}

const ConnectAgentContent = memo<ConnectAgentContentProps>(
  ({ groupId, onTitleChange, visibility }) => {
    const { t } = useTranslation('chat');
    const { close, setCanDismissByClickOutside } = useModalContext();
    const navigate = useWorkspaceAwareNavigate();
    const storeCreateAgent = useAgentStore((s) => s.createAgent);
    const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
    const refreshAgentList = useHomeStore((s) => s.refreshAgentList);

    // Workspace agents must bind workspace devices: a workspace agent on a
    // personal device is unreachable to other members and rejected server-side.
    const activeWorkspaceId = useActiveWorkspaceId();
    const restrictToWorkspaceDevices = Boolean(activeWorkspaceId);

    const [step, setStep] = useState(0);
    const [target, setTarget] = useState<ScanTarget | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<HeterogeneousAgentType[]>([]);
    const [profiles, setProfiles] = useState<
      Partial<Record<RemoteHeterogeneousAgentType, ConnectAgentProfile>>
    >({});
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | undefined>();
    const [done, setDone] = useState<CreatedAgent[] | null>(null);

    const { scan, state: scanState } = useAgentScan();

    useEffect(() => {
      setCanDismissByClickOutside(!creating);
    }, [creating, setCanDismissByClickOutside]);

    const {
      data: devices,
      error: devicesError,
      isLoading: loadingDevices,
      isValidating: fetchingDevices,
      mutate: refetchDevices,
    } = useDeviceList();

    const listedDevices = useMemo(
      () => (devices ?? []).filter((d) => !restrictToWorkspaceDevices || d.scope === 'workspace'),
      [devices, restrictToWorkspaceDevices],
    );
    // The connect flow obeys the same 0/1/N device rules as the execution
    // contract: with exactly one legal candidate (desktop counts as its own
    // "This device" candidate) the flow auto-resolves it instead of showing a
    // one-row picker. Loading/failed inventory never counts as 0 or 1.
    const deviceInventoryComplete = !loadingDevices && !fetchingDevices && !devicesError;

    const deviceLabel = useCallback(
      (device: DeviceListItem) => device.friendlyName || device.hostname || device.deviceId,
      [],
    );

    const targetLabel =
      target?.kind === 'device' ? deviceLabel(target.device) : t('connectAgent.create.localDevice');

    const inventory = useMemo(() => {
      if (scanState.status !== 'success' || !scanState.agents) return [];
      const rank = (available?: boolean) => (available ? 0 : 1);
      return [...CONNECTABLE_PROVIDERS]
        .map((provider) => ({ provider, status: scanState.agents?.[provider.type] }))
        .sort((a, b) => rank(a.status?.available) - rank(b.status?.available));
    }, [scanState]);

    const detectedCount = inventory.filter((entry) => entry.status?.available).length;

    const selectedProviders = useMemo(
      () => CONNECTABLE_PROVIDERS.filter((provider) => selectedTypes.includes(provider.type)),
      [selectedTypes],
    );
    // Customize (step 3) only applies to a single selection
    const single = selectedProviders.length === 1 ? selectedProviders[0] : null;
    const singleVersion = single ? scanState.agents?.[single.type]?.version : undefined;

    const pickTarget = useCallback(
      (next: ScanTarget) => {
        setTarget(next);
        setSelectedTypes([]);
        setProfiles({});
        setStep(1);
        void scan(next);
      },
      [scan],
    );

    // 1-candidate rule: exactly one legal connect target resolves at flow
    // admission rather than rendering a one-row picker — desktop is its own
    // "This device" candidate, so this fires only when (isDesktop ? 1 : 0) +
    // listedDevices.length totals 1.
    const autoResolvedTargetRef = useRef(false);
    useEffect(() => {
      if (autoResolvedTargetRef.current || step !== 0 || !deviceInventoryComplete) return;
      const candidates = (isDesktop ? 1 : 0) + listedDevices.length;
      if (candidates !== 1) return;
      autoResolvedTargetRef.current = true;
      pickTarget(isDesktop ? { kind: 'local' } : { device: listedDevices[0], kind: 'device' });
    }, [deviceInventoryComplete, listedDevices, pickTarget, step]);

    const rescan = useCallback(() => {
      if (!target) return;
      setSelectedTypes([]);
      void scan(target);
    }, [scan, target]);

    const toggleType = useCallback(
      (provider: ConnectableProvider) => {
        setSelectedTypes((prev) =>
          prev.includes(provider.type)
            ? prev.filter((type) => type !== provider.type)
            : [...prev, provider.type],
        );
        // Prefetch the platform's profile so create/customize can prefill
        // title / description / avatar without an extra wait.
        if (
          provider.kind === 'platform' &&
          isRemoteHeterogeneousType(provider.type) &&
          !profiles[provider.type]
        ) {
          const deviceId = target?.kind === 'device' ? target.device.deviceId : currentDeviceId;
          if (!deviceId) return;
          const platform = provider.type;
          void deviceService
            .getAgentProfile({ deviceId, platform })
            .then((profile) => setProfiles((prev) => ({ ...prev, [platform]: profile })))
            .catch(() => {});
        }
      },
      [currentDeviceId, profiles, target],
    );

    const goConfirm = useCallback(() => {
      if (!single) return;
      const profile = isRemoteHeterogeneousType(single.type) ? profiles[single.type] : undefined;
      const productTitle = profile?.title ?? single.title;
      setName(
        heteroAgentDefaultName({ productTitle, visibility, workspaceId: activeWorkspaceId }) ??
          productTitle,
      );
      setDescription(profile?.description ?? '');
      setStep(2);
    }, [activeWorkspaceId, profiles, single, visibility]);

    const buildCreateParams = useCallback(
      (provider: ConnectableProvider, overrides?: { description?: string; name?: string }) => {
        return {
          config: buildConnectAgentConfig({
            overrides,
            profile: isRemoteHeterogeneousType(provider.type) ? profiles[provider.type] : undefined,
            provider,
            target:
              target?.kind === 'device'
                ? { deviceId: target.device.deviceId, kind: 'device' }
                : { deviceId: currentDeviceId, kind: 'local' },
          }),
          groupId,
          visibility,
        };
      },
      [currentDeviceId, groupId, profiles, target, visibility],
    );

    const handleCreate = useCallback(
      async (overrides?: { description?: string; name?: string }) => {
        if (!target || selectedProviders.length === 0) return;
        setCreating(true);
        setCreateError(undefined);
        try {
          const created = await Promise.all(
            selectedProviders.map(async (provider) => {
              const params = buildCreateParams(
                provider,
                provider === single ? overrides : undefined,
              );
              const result = await storeCreateAgent(params);
              return {
                agentId: result.agentId,
                locationLabel: targetLabel,
                provider,
                // Mirror the default-name seeding in createAgent so the done
                // screen shows the same label the sidebar will.
                title:
                  params.config.name?.trim() ||
                  heteroAgentDefaultName({
                    productTitle: params.config.title,
                    visibility,
                    workspaceId: activeWorkspaceId,
                  }) ||
                  agentDisplayName(params.config, provider.title),
                version: scanState.agents?.[provider.type]?.version,
              } satisfies CreatedAgent;
            }),
          );
          await refreshAgentList();
          setDone(created);
          onTitleChange(
            created.length === 1
              ? t('connectAgent.create.doneTitle', { name: created[0].title })
              : t('connectAgent.create.doneTitleMany', { total: created.length }),
          );
        } catch (error) {
          setCreateError(error instanceof Error ? error.message : String(error));
        } finally {
          setCreating(false);
        }
      },
      [
        activeWorkspaceId,
        buildCreateParams,
        onTitleChange,
        refreshAgentList,
        scanState,
        selectedProviders,
        single,
        storeCreateAgent,
        t,
        target,
        targetLabel,
        visibility,
      ],
    );

    const openChat = useCallback(
      (agentId: string) => {
        close();
        navigate(`/agent/${agentId}`);
      },
      [close, navigate],
    );

    // ── Done: connected summary stays inside the modal ──
    if (done) {
      return (
        <div className="flex flex-col gap-2" style={{ paddingBlock: '16px 8px' }}>
          <SectionLabel>{t('connectAgent.create.doneHint')}</SectionLabel>
          <div className={styles.groupList}>
            {done.map((agent) => (
              <div className={`${styles.row} ${styles.rowStatic}`} key={agent.agentId}>
                <agent.provider.brand.Avatar size={32} />
                <div className="flex flex-col flex-1 gap-[1px]" style={{ minWidth: 0 }}>
                  <div className="font-semibold text-[13px]">{agentDisplayName(agent)}</div>
                  <div className="truncate block text-[12px] text-muted-foreground">
                    {agent.provider.title}
                    {agent.version ? ` ${agent.version}` : ''} · {agent.locationLabel}
                  </div>
                </div>
                <div className={styles.dot} />
                <Button size="sm" onClick={() => openChat(agent.agentId)}>
                  {t('connectAgent.create.openChat')}
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end" style={{ paddingBlockStart: 8 }}>
            <Button variant="default" onClick={close}>
              {t('connectAgent.create.done')}
            </Button>
          </div>
        </div>
      );
    }

    // ── Step 1: choose the machine ──
    if (step === 0) {
      const isRefreshing = loadingDevices || fetchingDevices;
      const deviceListState = getDeviceListState({
        hasDevices: listedDevices.length > 0,
        isFetching: isRefreshing,
      });
      // Offline devices stay legal candidates (they cannot start yet, but
      // they are not "no device"), so the empty state only covers a truly
      // empty inventory — matching the contract's zero-device rule.
      const showEmpty = !isDesktop && !isRefreshing && listedDevices.length === 0;

      return (
        <div className="flex flex-col gap-4" style={{ paddingBlock: '16px 8px' }}>
          <SectionLabel>{t('connectAgent.create.stepDevice')}</SectionLabel>
          {showEmpty ? (
            <div className={styles.emptyCard}>
              <div className={`flex flex-col items-center gap-2.5 ${styles.emptyHero}`}>
                <span className={styles.heroIcon}>
                  <LaptopIcon size={26} />
                </span>
                <div className="text-[17px] font-semibold">
                  {t('connectAgent.create.noDevices')}
                </div>
                <div className="text-muted-foreground" style={{ maxWidth: 400 }}>
                  {t('connectAgent.create.noDevicesDesc')}
                </div>
              </div>
              <div className={styles.emptyOptions}>
                <div className={styles.emptyOption}>
                  <span className={styles.emptyOptionIcon}>
                    <Download size={20} />
                  </span>
                  <div className="flex flex-col gap-[3px]">
                    <div className="font-medium">{t('connectAgent.create.downloadDesktop')}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t('connectAgent.create.noDevicesDesktopHint')}
                    </div>
                  </div>
                  <div className={styles.emptyOptionAction}>
                    <a href={DOWNLOAD_URL.default} rel={'noreferrer'} target={'_blank'}>
                      <Button style={{ width: '100%' }} variant="default">
                        <Download data-icon="inline-start" size={14} />
                        {t('connectAgent.create.download')}
                      </Button>
                    </a>
                  </div>
                </div>
                <div className={styles.emptyOption}>
                  <span className={styles.emptyOptionIcon}>
                    <TerminalIcon size={20} />
                  </span>
                  <div className="flex flex-col gap-[3px]">
                    <div className="font-medium">{t('connectAgent.create.connectCli')}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t('connectAgent.create.noDevicesCliHint')}
                    </div>
                  </div>
                  <div className={styles.emptyOptionAction}>
                    <CommandLine command={t('connectAgent.create.noDevicesCmd')} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end" style={{ padding: 8 }}>
                <Button
                  loading={isRefreshing}
                  size="sm"
                  variant="ghost"
                  onClick={() => void refetchDevices()}
                >
                  <RefreshCw data-icon="inline-start" size={13} />
                  {t('connectAgent.create.refresh')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {isDesktop && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>{t('connectAgent.create.thisDevice')}</SectionLabel>
                  <div className={styles.groupList}>
                    <DeviceRow
                      icon=<LaptopIcon data-icon="inline-start" size={18} />
                      statusText={t('connectAgent.create.online')}
                      subtitle={t('connectAgent.create.localDeviceDesc')}
                      title={t('connectAgent.create.localDevice')}
                      onClick={() => pickTarget({ kind: 'local' })}
                    />
                  </div>
                </div>
              )}
              {deviceListState !== 'empty' && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <SectionLabel>{t('connectAgent.create.connectedDevices')}</SectionLabel>
                    <Button
                      loading={isRefreshing}
                      size="sm"
                      variant="ghost"
                      onClick={() => void refetchDevices()}
                    >
                      <RefreshCw data-icon="inline-start" size={13} />
                      {t('connectAgent.create.refresh')}
                    </Button>
                  </div>
                  <div className={styles.groupList}>
                    {deviceListState === 'loading'
                      ? [96, 140, 112].map((width) => (
                          <SkeletonRow squareIcon key={width} width={width} />
                        ))
                      : listedDevices.map((device) => (
                          <DeviceRow
                            icon={getDeviceIcon(device.platform, 18)}
                            key={device.deviceId}
                            offline={!device.online}
                            subtitle={device.hostname || device.deviceId}
                            title={deviceLabel(device)}
                            statusText={
                              device.online
                                ? t('connectAgent.create.online')
                                : t('connectAgent.create.offline')
                            }
                            onClick={() => pickTarget({ device, kind: 'device' })}
                          />
                        ))}
                  </div>
                </div>
              )}
              {isDesktop && deviceListState === 'empty' && (
                <div className={styles.commandHint}>
                  <div className="text-muted-foreground">
                    {t('connectAgent.create.noDevicesCliHint')}
                  </div>
                  <CommandLine command={t('connectAgent.create.noDevicesCmd')} />
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ── Step 2: auto-scanned agent inventory ──
    if (step === 1 && target) {
      const scanning = scanState.status === 'scanning';

      return (
        <div className="flex flex-col gap-2" style={{ paddingBlock: '0 8px' }}>
          {/* Rescan stays mounted (disabled while scanning) and the row reserves
              its height — no jump when the scan settles */}
          <div className="flex items-center justify-between" style={{ minHeight: 28 }}>
            <SectionLabel>
              {t('connectAgent.create.stepAgents', { device: targetLabel })}
            </SectionLabel>
            {!(scanState.status === 'success' && detectedCount === 0) &&
              scanState.status !== 'error' && (
                <Button disabled={scanning} size="sm" variant="ghost" onClick={rescan}>
                  <RefreshCw data-icon="inline-start" size={13} />
                  {t('connectAgent.create.rescan')}
                </Button>
              )}
          </div>

          {scanning && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>{t('connectAgent.create.scanning')}</SectionLabel>
              <ScrollableAgentList>
                {[90, 70, 110, 80, 100, 75, 95]
                  .slice(0, CONNECTABLE_PROVIDERS.length)
                  .map((width, i) => (
                    <SkeletonRow key={i} width={width} />
                  ))}
              </ScrollableAgentList>
            </div>
          )}

          {scanState.status === 'error' && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t('connectAgent.create.scanFailed')}</AlertTitle>
              <AlertDescription>{scanState.error}</AlertDescription>
              <AlertAction>
                <Button size="sm" onClick={rescan}>
                  {t('connectAgent.create.rescan')}
                </Button>
              </AlertAction>
            </Alert>
          )}

          {scanState.status === 'success' && detectedCount === 0 && (
            <div className="flex flex-col items-center gap-3" style={{ paddingBlock: 24 }}>
              <ScanSearch size={28} />
              <div className="font-semibold">{t('connectAgent.create.noneDetected')}</div>
              <div className="text-muted-foreground" style={{ textAlign: 'center' }}>
                {t('connectAgent.create.noneDetectedHint')}
              </div>
              <Button size="sm" variant="default" onClick={rescan}>
                <RefreshCw data-icon="inline-start" size={13} />
                {t('connectAgent.create.rescanDevice')}
              </Button>
            </div>
          )}

          {scanState.status === 'success' && detectedCount > 0 && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>
                {t('connectAgent.create.detectedCount', { total: detectedCount })}
              </SectionLabel>
              <ScrollableAgentList>
                {inventory.map(({ provider, status }) => (
                  <AgentScanRow
                    key={provider.type}
                    provider={provider}
                    selected={selectedTypes.includes(provider.type)}
                    status={status}
                    subtitle={t(`connectAgent.providerDesc.${provider.type}`)}
                    unavailableText={t('connectAgent.create.notInstalled')}
                    onToggle={() => toggleType(provider)}
                  />
                ))}
              </ScrollableAgentList>
            </div>
          )}

          {createError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t('connectAgent.create.createFailed')}</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-2 justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft data-icon="inline-start" size={14} />
              {t('connectAgent.create.back')}
            </Button>
            <div className="flex items-center gap-2">
              {single && (
                <Button variant="ghost" onClick={goConfirm}>
                  {t('connectAgent.create.customizeName')}
                </Button>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <Button
                        disabled={selectedProviders.length === 0}
                        loading={creating}
                        variant="default"
                        onClick={() => void handleCreate()}
                      >
                        {selectedProviders.length === 0
                          ? t('connectAgent.create.connect')
                          : selectedProviders.length === 1
                            ? t('connectAgent.create.connectOne', {
                                name: selectedProviders[0].title,
                              })
                            : t('connectAgent.create.connectMany', {
                                total: selectedProviders.length,
                              })}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>
                  {selectedProviders.length > 0 ? '' : t('connectAgent.create.selectFirst')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      );
    }

    // ── Step 3: confirm (optional customization, single-select only) ──
    if (step === 2 && single) {
      return (
        <div className="flex flex-col gap-4" style={{ paddingBlock: '16px 8px' }}>
          <SectionLabel>{t('connectAgent.create.stepConfirm')}</SectionLabel>
          <div className="flex items-center gap-3">
            <single.brand.Avatar size={44} />
            <div className="flex flex-col flex-1">
              <Input
                maxLength={60}
                placeholder={t('connectAgent.create.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <Textarea
            maxLength={200}
            placeholder={t('connectAgent.create.descriptionPlaceholder')}
            rows={2}
            style={{ maxHeight: '4lh' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className={styles.groupList}>
            <div className={`${styles.row} ${styles.rowStatic}`}>
              <div className={styles.iconBox}>
                {target?.kind === 'device' ? (
                  getDeviceIcon(target.device.platform, 18)
                ) : (
                  <LaptopIcon size={18} />
                )}
              </div>
              <div className="flex flex-col flex-1 gap-[1px]" style={{ minWidth: 0 }}>
                <div className="text-[13px]">
                  {t('connectAgent.create.runsOn', { device: targetLabel })}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {single.title}
                  {singleVersion ? ` ${singleVersion}` : ''} ·{' '}
                  {t('connectAgent.create.detectedInScan')}
                </div>
              </div>
              <CheckCircle2 color={cssVar.colorSuccess} size={16} />
            </div>
          </div>
          {createError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t('connectAgent.create.createFailed')}</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft data-icon="inline-start" size={14} />
              {t('connectAgent.create.back')}
            </Button>
            <Button
              disabled={!name.trim()}
              loading={creating}
              variant="default"
              onClick={() => void handleCreate({ description, name })}
            >
              {t('connectAgent.create.connectOne', { name: single.title })}
            </Button>
          </div>
        </div>
      );
    }

    return null;
  },
);

ConnectAgentContent.displayName = 'ConnectAgentContent';

export interface OpenConnectAgentModalOptions {
  groupId?: string;
  visibility?: 'private' | 'public';
}

export const openConnectAgentModal = (options?: OpenConnectAgentModalOptions): ModalInstance => {
  // The done view promotes the result into the modal title ("N agents
  // connected") — content updates it through the instance, which only exists
  // after createModal returns, hence the holder indirection.
  const holder: { instance?: ModalInstance } = {};
  holder.instance = createModal({
    content: (
      <ConnectAgentContent
        groupId={options?.groupId}
        visibility={options?.visibility}
        onTitleChange={(title) => holder.instance?.update({ title })}
      />
    ),
    footer: null,
    maskClosable: true,
    styles: { content: { paddingBlockStart: 0 } },
    title: i18nT('connectAgent.create.title', { ns: 'chat' }),
    width: 520,
  });
  return holder.instance;
};
