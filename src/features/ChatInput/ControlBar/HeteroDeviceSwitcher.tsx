'use client';

import { DOWNLOAD_URL, isDesktop } from '@orvilo/const';
import type { DeviceExecutionTarget } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  InfoIcon,
  MonitorDownIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import {
  memo,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import InstantSwitch from '@/components/InstantSwitch';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { useLocalSandboxCapability } from '@/features/ChatInput/hooks/useLocalSandboxCapability';
import { useSelectExecutionTarget } from '@/features/ChatInput/hooks/useSelectExecutionTarget';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useDeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';
import { TabIdContext } from '@/features/Electron/TabHost/TabIdContext';
import {
  ExecutionTargetDeviceStatus,
  ExecutionTargetIcon,
  groupExecutionTargetDevices,
} from '@/features/ExecutionTargetPicker';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import {
  isHeterogeneousSandboxExecutionAvailable,
  isLocalSandboxEnabled,
  resolveExecutionTarget,
} from '@/helpers/executionTarget';
import { useIsGatewayModeEnabled } from '@/helpers/gatewayMode';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { localFileService } from '@/services/electron/localFileService';
import { useAgentStore } from '@/store/agent';
import { useElectronStore } from '@/store/electron';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import { SimpleTooltip } from '../SimpleTooltip';
import { formatLockedControlTooltip } from '../utils/lockedControlTooltip';
import { useCommitWorkingDirectory } from './useCommitWorkingDirectory';

const styles = createStaticStyles(({ css }) => ({
  button: css`
    cursor: pointer;

    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;

    padding-block: 2px;
    padding-inline: 4px;
    border-radius: 4px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  buttonLabel: css`
    overflow: hidden;
    max-width: 120px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  buttonOpen: css`
    &&,
    &&:hover {
      color: var(--foreground);
      background: var(--muted);
    }
  `,
  buttonWarning: css`
    color: ${cssVar.colorWarningText};

    &:hover {
      color: ${cssVar.colorWarningText};
      background: ${cssVar.colorWarningBg};
    }
  `,
  buttonReadonly: css`
    cursor: default;

    &:hover {
      color: ${cssVar.colorTextSecondary};
      background: transparent;
    }
  `,
  check: css`
    flex: none;
    margin-inline-start: auto;
    color: ${cssVar.colorPrimary};
  `,
  desc: css`
    display: flex;
    gap: 6px;
    align-items: center;

    font-size: 11px;
    color: ${cssVar.colorTextDescription};
  `,
  extra: css`
    display: flex;
    flex: none;
    gap: 4px;
    align-items: center;

    margin-inline-start: auto;

    /* A disabled row dims itself, but its trailing action is the way OUT of
       that state — dimming the setup button would read as "also unavailable". */
    opacity: 1;
  `,
  extraInfo: css`
    cursor: help;

    display: flex;
    align-items: center;

    color: ${cssVar.colorTextQuaternary};

    transition: color 0.2s;

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  deviceList: css`
    overflow-y: auto;
    max-height: 240px;

    /* Room for the scrollbar so rows don't sit flush against it. */
    margin-inline-end: -4px;
    padding-inline-end: 4px;
  `,
  empty: css`
    padding-block: 8px;
    padding-inline: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
  option: css`
    cursor: pointer;

    display: flex;
    gap: 10px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 8px;
    border-radius: calc(var(--radius) - 2px);

    transition: background-color 0.2s;

    &[aria-current='true'],
    &[aria-current='true']:hover {
      background: var(--muted);
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  optionDisabled: css`
    cursor: not-allowed;

    &:hover {
      background: transparent;
    }
  `,
  optionIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
  `,
  optionMeta: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1px;

    min-width: 0;
  `,
  reconnectButton: css`
    min-height: 18px;
    padding-block: 0;
    padding-inline: 2px;
    font-size: 11px;
  `,
  optionTitle: css`
    overflow: hidden;

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  tag: css`
    flex: none;

    padding-block: 0;
    padding-inline: 5px;
    border-radius: 4px;

    font-size: 10px;
    line-height: 16px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  header: css`
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: space-between;

    padding-block: 4px;
    padding-inline: 8px;
  `,
  headerInfo: css`
    cursor: help;
    color: ${cssVar.colorTextQuaternary};
    transition: color 0.2s;

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  headerTitle: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
  `,
  manageButton: css`
    cursor: pointer;

    display: flex;
    gap: 3px;
    align-items: center;

    padding: 0;
    border: none;

    font-size: 11px;
    color: ${cssVar.colorTextQuaternary};

    background: none;

    transition: color 0.2s;

    &:hover {
      color: ${cssVar.colorPrimary};
    }
  `,
  groupLabel: css`
    padding-block: 4px;
    padding-inline: 8px;

    font-size: 11px;
    font-weight: 500;
    color: ${cssVar.colorTextQuaternary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
}));

interface OptionRowProps {
  active: boolean;
  desc?: ReactNode;
  disabled?: boolean;
  /**
   * Trailing controls that belong to the row but are not the row's selection —
   * rendered before the checkmark, with clicks kept from selecting the row so a
   * setting can be adjusted without switching environment.
   */
  extra?: ReactNode;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tag?: ReactNode;
}

const OptionRow = memo<OptionRowProps>(
  ({ active, desc, disabled, extra, icon, label, onClick, tag }) => {
    return (
      <div
        aria-current={active ? 'true' : undefined}
        className={cx(styles.option, disabled && styles.optionDisabled)}
        role={disabled ? 'group' : 'button'}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) onClick();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (!disabled) onClick();
        }}
      >
        <div className={styles.optionIcon} style={disabled ? { opacity: 0.55 } : undefined}>
          {icon}
        </div>
        <div className={styles.optionMeta} style={disabled ? { opacity: 0.55 } : undefined}>
          <div className="flex flex-row items-center gap-1.5">
            <span className={styles.optionTitle}>{label}</span>
            {tag ? <span className={styles.tag}>{tag}</span> : null}
          </div>
          {desc ? <div className={styles.desc}>{desc}</div> : null}
        </div>
        {extra ? (
          <div
            className={styles.extra}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {extra}
          </div>
        ) : null}
        {active ? (
          <span aria-hidden="true" className={cx('anticon', styles.check)}>
            <CheckIcon fill={'transparent'} height={14} size={14} width={14} />
          </span>
        ) : null}
      </div>
    );
  },
);

OptionRow.displayName = 'HeteroDeviceSwitcher.OptionRow';

interface HeteroDeviceSwitcherProps {
  agentId: string;
}

const HeteroDeviceSwitcher = memo<HeteroDeviceSwitcherProps>(({ agentId }) => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const tabId = use(TabIdContext);
  const isActiveTab = useElectronStore((s) => !tabId || s.activeTabId === tabId);
  useLayoutEffect(() => {
    // Record dismissal at the store transition, before a retained tab can
    // suspend its render effects. The open gate alone only hides the portal.
    const unsubscribe = tabId
      ? useElectronStore.subscribe((state) => {
          if (state.activeTabId !== tabId) setOpen(false);
        })
      : undefined;
    return () => {
      unsubscribe?.();
      setOpen(false);
    };
  }, [tabId]);
  const navigate = useWorkspaceAwareNavigate();
  const { canUseResource, isAccessLoading } = useChatInputResourceAccess();

  const agentWorkspaceId = useAgentStore((s) => s.agentMap[agentId]?.workspaceId);
  const isWorkspaceAgent = Boolean(agentWorkspaceId);

  // Shared config merged with the caller's per-agent override —
  // the hook eagerly fetches the `workspaceUserSettings` bucket on mount so
  // what the picker shows and what dispatch will actually do always agree.
  const {
    agencyConfig,
    canDisplayExecutionTarget,
    canSelectExecutionTarget,
    canSelectPersonalDevice,
    isPreferenceLoading: isWorkspacePreferenceLoading,
    workspaceScoped,
  } = useTopicAgencyConfig(agentId);
  const canShowExecutionTarget = canUseResource && canDisplayExecutionTarget;

  const heteroType = agencyConfig?.heterogeneousProvider?.type;
  const boundDeviceId = agencyConfig?.boundDeviceId;

  // Heterogeneous agents bring their own toolchain and must execute somewhere, so `'none'`
  // (plain chat, no execution environment) isn't a valid target for them: hide
  // the option and never fall back to / honour a stale stored `'none'`.
  const isHetero = !!heteroType;
  const enableCloudSandbox = useServerConfigStore(
    (s) => featureFlagsSelectors(s).enableCloudSandbox,
  );
  const supportsSandbox =
    enableCloudSandbox && isHeterogeneousSandboxExecutionAvailable(heteroType);

  // Workspace-keyed SWR fetch — the raw lambdaQuery key has no workspace
  // dimension, so the picker kept showing the previous workspace's pool after
  // a switch.
  const { data: devices, isLoading, mutate: refreshDevices } = useDeviceList();

  // The current machine's own gateway deviceId (desktop only), used to badge the
  // matching gateway row with a "This computer" tag. The route description
  // distinguishes gateway execution from a direct local process.
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const gatewayDeviceInfo = useElectronStore((s) => s.gatewayDeviceInfo);
  const currentDeviceId = isDesktop ? gatewayDeviceInfo?.deviceId : undefined;
  const [reconnectingDeviceId, setReconnectingDeviceId] = useState<string>();

  const handleReconnectDevice = useCallback(
    async (deviceId: string) => {
      setReconnectingDeviceId(deviceId);
      try {
        if (isDesktop && deviceId === currentDeviceId) {
          await useElectronStore.getState().connectGateway();
        } else {
          window.location.href = `orvilo://device/reconnect?deviceId=${encodeURIComponent(deviceId)}`;
        }

        // The deep link crosses browser → desktop → gateway → server, so give
        // the live device registry a short window to converge instead of
        // making the user close and reopen the picker to see the result.
        let connected = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const nextDevices = await refreshDevices();
          if (nextDevices?.some((device) => device.deviceId === deviceId && device.online)) {
            connected = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!connected) toast.error(t('heteroAgent.executionTarget.reconnectFailed'));
      } catch (error) {
        console.error('Device reconnect failed:', error);
        toast.error(t('heteroAgent.executionTarget.reconnectFailed'));
      } finally {
        setReconnectingDeviceId(undefined);
      }
    },
    [currentDeviceId, refreshDevices, t],
  );

  // A member's explicit target override may resolve `local`; without one the
  // raw shared fallback stays workspace-scoped so a legacy `local` value keeps
  // routing to its bound workspace device rather than this member's desktop.
  const deviceRoutingAvailable = useIsGatewayModeEnabled(agentId);
  const executionTarget = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: isDesktop,
    deviceRoutingAvailable,
    isHetero,
    sandboxExecutionAvailable: supportsSandbox,
    workspaceScoped,
  });
  // A read-only member receives the safe target type but not `boundDeviceId`.
  // Use the stored type for the summary so a fixed, bound `local` target is
  // described as a workspace device instead of being client-coerced to sandbox.
  const chipExecutionTarget = canSelectExecutionTarget
    ? executionTarget
    : (agencyConfig?.executionTarget ?? executionTarget);

  // ONE shared derivation with the agent-settings page: the same
  // `useDeviceSelectorState` (which feeds `shouldShowDeviceSelector`) decides
  // whether the picker may open — no local formula that could drift from it.
  // The candidate pool it judges against is `executionTargetDeviceCandidates`:
  // workspace scope includes the caller's private enrollments, and a failed or
  // unfinished inventory resolves `pending` — never 0 candidates.
  const {
    bindingState: deviceBindingState,
    deviceInventoryComplete,
    deviceInventoryError,
    selectableDevices,
    showDeviceSelector,
  } = useDeviceSelectorState({
    boundDeviceId,
    canSelectDevice: canSelectExecutionTarget,
    permissionsLoaded: !isWorkspacePreferenceLoading && !isAccessLoading,
    scope: isWorkspaceAgent ? 'workspace' : 'personal',
  });

  // A stored binding that names a device outside this agent's legal pool is
  // invalid — deleted, scope-revoked, or re-homed. The contract forbids a
  // silent re-bind (resolveExecutionDevice blocks with DEVICE_BINDING_INVALID),
  // so surface an explicit repair state: clicking a device row below IS the
  // authorized repair write.
  const bindingInvalid = executionTarget === 'device' && deviceBindingState === 'invalid';

  // `showDeviceSelector` is the shared contract formula verbatim: picker only
  // past >1 candidates. The popover doubles as the repair and inventory-error
  // surface, though, so it stays reachable past the formula — for a broken
  // binding the banner says what picking a row means, and for a failed
  // inventory the only content is the retry affordance. A member without
  // select permission always gets the read-only chip.
  const canShowExecutionTargetSelector =
    canShowExecutionTarget &&
    canSelectExecutionTarget &&
    (showDeviceSelector || bindingInvalid || Boolean(deviceInventoryError));

  // Device-only CLIs cannot fall back to the cloud sandbox. When a web/legacy
  // config has no usable device target, open the picker once so `none` is an
  // explicit setup prompt rather than a disabled-but-active sandbox row.
  useEffect(() => {
    if (!canShowExecutionTargetSelector) return;
    if (supportsSandbox) return;
    if (isWorkspacePreferenceLoading) return;
    if (executionTarget !== 'none') return;
    setOpen(true);
  }, [
    canShowExecutionTargetSelector,
    executionTarget,
    isWorkspacePreferenceLoading,
    supportsSandbox,
  ]);

  // The sandbox is a modifier on `local`, not a target of its own, so the two
  // local rows differ only by this flag. Reading it through the same helper the
  // server and the desktop runner use keeps the checkmark honest: it lights up
  // exactly when a command would actually be fenced.
  const supportsLocalShellSandbox = !heteroType || heteroType === 'orvilo';
  const localSandboxEnabled =
    supportsLocalShellSandbox && isLocalSandboxEnabled(agencyConfig, executionTarget);
  const localSandboxNetwork = agencyConfig?.localSandboxNetwork === true;
  const { data: sandboxCapability, mutate: revalidateSandboxCapability } =
    useLocalSandboxCapability();
  const canUseLocalSandbox = sandboxCapability?.available === true;

  // The desktop downgrades its own verdict when a fence fails to establish (the
  // cheap probe can't see that far), so re-ask each time the picker opens
  // instead of showing a stale "available" for the rest of the session.
  useEffect(() => {
    if (!isDesktop || !open) return;
    void revalidateSandboxCapability();
  }, [open, revalidateSandboxCapability]);

  // `homeFallback: false` on purpose — this must reflect whether the user has
  // actually chosen a directory, not the runtime's convenience fallback.
  const configuredWorkingDirectory = useEffectiveWorkingDirectory(agentId, { homeFallback: false });
  const { commit: commitWorkingDirectory } = useCommitWorkingDirectory(agentId);

  /**
   * Give a sandboxed agent somewhere to work when the user has not picked a
   * directory yet.
   *
   * The fence is scoped to the working directory, so without one the run is
   * refused — a first use that fails on a requirement the picker never
   * mentioned. Rather than fence a directory nobody chose *silently*, the
   * default is written into the same setting the chip reads, so the answer to
   * "where is this running?" stays visible and changeable.
   */
  const ensureSandboxWorkingDirectory = useCallback(async () => {
    if (configuredWorkingDirectory) return;

    const { path } = await localFileService.ensureSandboxWorkspace({ agentId });
    // Leave it unset if the directory could not be created: pointing the fence
    // at a path that does not exist would fail later and less clearly.
    //
    // `localTarget` because the sandbox pick is about to make `local` the
    // target: the config still describes the previous one here, so without it a
    // workspace member's first pick would file the path against the shared
    // target (or nowhere) and the very next command would refuse again.
    if (path) await commitWorkingDirectory({ path }, { localTarget: true });
  }, [agentId, commitWorkingDirectory, configuredWorkingDirectory]);

  const selectExecutionTarget = useSelectExecutionTarget(agentId);
  const handleSelect = useCallback(
    async (target: DeviceExecutionTarget, deviceId?: string, localSandbox?: boolean) => {
      setOpen(false);
      if (localSandbox) await ensureSandboxWorkingDirectory();
      await selectExecutionTarget(target, deviceId, { localSandbox });
    },
    [ensureSandboxWorkingDirectory, selectExecutionTarget],
  );

  // Setting up the backend raises an elevation prompt and creates a dedicated
  // OS account, so it only ever happens on this explicit click. The popover
  // stays open throughout — the user came here to pick an environment, and the
  // row turning usable is the answer to what they clicked.
  const [isInstallingSandbox, setIsInstallingSandbox] = useState(false);
  const handleInstallSandbox = useCallback(async () => {
    setIsInstallingSandbox(true);
    try {
      const result = await localFileService.installSandbox();
      // The IPC already re-probed, so trust its verdict rather than firing
      // another round-trip. A cancelled prompt lands here too, with the
      // unchanged capability — nothing to report, the user just said no.
      await revalidateSandboxCapability(result.capability, { revalidate: false });
    } finally {
      setIsInstallingSandbox(false);
    }
  }, [revalidateSandboxCapability]);

  // Toggling the network does NOT change which environment is selected — same
  // dormant semantics the sandbox flag itself has when another environment is
  // active, so the popover stays open and nothing is switched behind the user.
  const handleToggleSandboxNetwork = useCallback(
    async (enabled: boolean) => {
      await selectExecutionTarget(executionTarget, boundDeviceId, {
        localSandbox: localSandboxEnabled,
        localSandboxNetwork: enabled,
      });
    },
    [selectExecutionTarget, executionTarget, boundDeviceId, localSandboxEnabled],
  );

  // No mount-time write: a binding is created ONLY by an explicit user choice
  // or the server's atomic first-bind at admission. Opening this composer (or
  // re-rendering under StrictMode / after a refresh) must produce zero
  // `selectExecutionTarget` calls — an implicit 'local' write used to live
  // here and silently committed a target for agents the user merely opened.

  if (!canShowExecutionTarget) return null;

  // The read-only "runs on" summary resolves the bound device's name from the
  // same inventory the picker uses — hiding the selector never hides where a
  // run executes.
  const boundDevice =
    executionTarget === 'device' ? devices?.find((d) => d.deviceId === boundDeviceId) : undefined;

  // The picker splits by whether the caller is inside a workspace agent:
  //
  // - **Personal agent** — flat list of the caller's personal-scope devices
  //   only; there is no workspace context so no group split makes sense.
  //   Never show `scope: 'workspace'` rows here (they belong to a workspace
  //   the personal-mode agent has nothing to do with).
  //
  // - **Workspace agent** — workspace devices plus caller-personal candidates
  //   only for a private owner or member-selectable caller. Other contexts
  //   retain only their exact personal member override. The API authorizes
  //   personal inventory to the caller; shared defaults grant no personal pool.
  //
  // Naming — Personal is reserved for the account-tier concept; workspace
  // groupings say Private/Workspace (私人/工作区) instead.
  const {
    personal: personalOnlyDevices,
    privateWorkspace: privateDevices,
    workspace: workspaceDevices,
  } = groupExecutionTargetDevices(selectableDevices);
  // Workspace agents always render the Private / Workspace group split (even
  // when one side is empty — the labels tell the user which pool they're
  // looking at). Personal mode stays flat.
  const showDeviceGroups = isWorkspaceAgent;

  // Empty-state accounting must use the rows the CURRENT agent can actually
  // pick (post scope filtering) — a workspace agent whose members only have
  // personal devices would otherwise render neither devices nor an empty
  // state. `selectableDevices` IS the shared candidate pool (private +
  // shared workspace devices included), so chat judges the same set the
  // settings page and the admission contract do.
  const deviceRows = selectableDevices;
  // A failed or unfinished inventory is not "zero candidates" — the empty
  // states only appear once the query settled without error.
  const hasNoDevices = deviceInventoryComplete && deviceRows.length === 0;
  const devicesLoading = isLoading && deviceRows.length === 0;

  // On web with no device, the prominent download card below replaces the small
  // header link — avoid showing the same CTA twice. Workspace agents get the
  // enroll hint instead: downloading the desktop app wouldn't help until the
  // machine is enrolled into the workspace pool.
  const showWebDownloadCard = !isDesktop && !isWorkspaceAgent && hasNoDevices;
  const showWorkspaceEnrollHint = isWorkspaceAgent && hasNoDevices;

  // Compute chip
  let chipIcon: ReactNode = <ExecutionTargetIcon target={'sandbox'} />;
  let chipLabel = t('heteroAgent.executionTarget.sandbox');
  if (chipExecutionTarget === 'none') {
    chipIcon = <ExecutionTargetIcon target={'none'} />;
    chipLabel = t('heteroAgent.executionTarget.none');
  } else if (chipExecutionTarget === 'auto') {
    chipIcon = <ExecutionTargetIcon target={'auto'} />;
    chipLabel = t('heteroAgent.executionTarget.auto');
  } else if (chipExecutionTarget === 'local') {
    // 本机始终使用通用的本地电脑图标，不区分具体平台
    chipIcon = <ExecutionTargetIcon target={canShowExecutionTargetSelector ? 'local' : 'device'} />;
    chipLabel = t(
      canShowExecutionTargetSelector
        ? 'heteroAgent.executionTarget.local'
        : 'heteroAgent.executionTarget.workspaceGroup',
    );
    // A fenced run looks identical to an unfenced one until a command fails, so
    // the chip — the only always-visible surface — has to say which it is.
    if (canShowExecutionTargetSelector && localSandboxEnabled) {
      chipIcon = (
        <span className="anticon" role="img">
          <ShieldCheckIcon fill={'transparent'} height={14} size={14} width={14} />
        </span>
      );
      chipLabel = t('heteroAgent.executionTarget.localSandbox');
    }
  } else if (chipExecutionTarget === 'device') {
    chipIcon = <ExecutionTargetIcon devicePlatform={boundDevice?.platform} target={'device'} />;
    // Selector hidden ≠ device hidden: a bound run still names where it runs.
    chipLabel = bindingInvalid
      ? t('heteroAgent.executionTarget.bindingInvalid')
      : (boundDevice?.friendlyName ??
        boundDevice?.hostname ??
        t('heteroAgent.executionTarget.unknownDevice'));
  }

  const isActive = (target: DeviceExecutionTarget, deviceId?: string) => {
    if (target === 'device') return executionTarget === 'device' && boundDeviceId === deviceId;
    // The two local rows share one target and are told apart by the sandbox
    // flag, so neither may claim the checkmark on the other's behalf.
    if (target === 'local') return executionTarget === 'local' && !localSandboxEnabled;
    return executionTarget === target;
  };

  const renderDeviceStatus = (d: NonNullable<typeof devices>[number]) => (
    <ExecutionTargetDeviceStatus
      offlineLabel={t('heteroAgent.executionTarget.offline')}
      online={d.online}
      onlineLabel={t('heteroAgent.executionTarget.onlineConnections', {
        count: d.channels.length,
      })}
    />
  );

  const renderDeviceRow = (d: NonNullable<typeof devices>[number]) => {
    const isCurrentMachine = d.deviceId === currentDeviceId;
    return (
      <OptionRow
        active={isActive('device', d.deviceId)}
        disabled={!d.online}
        icon={<ExecutionTargetIcon devicePlatform={d.platform} target={'device'} />}
        key={d.deviceId}
        label={d.friendlyName || d.hostname || d.deviceId}
        desc={
          isCurrentMachine ? t('heteroAgent.executionTarget.gatewayDesc') : renderDeviceStatus(d)
        }
        extra={
          d.online ? undefined : (
            <Button
              className={styles.reconnectButton}
              loading={reconnectingDeviceId === d.deviceId}
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                void handleReconnectDevice(d.deviceId);
              }}
            >
              <span className="anticon" data-icon="inline-start" role="img">
                <RefreshCwIcon fill={'transparent'} height={10} size={10} width={10} />
              </span>
              {t('heteroAgent.executionTarget.reconnect')}
            </Button>
          )
        }
        tag={
          isCurrentMachine
            ? `${t('connectAgent.create.localDevice')}${d.online ? '' : ` · ${t('heteroAgent.executionTarget.offline')}`}`
            : undefined
        }
        onClick={() => void handleSelect('device', d.deviceId)}
      />
    );
  };

  const content = (
    <div className="flex flex-col" style={{ maxWidth: 320, minWidth: 280 }}>
      <div className={styles.header}>
        <div className="flex flex-row items-center gap-1">
          <span className={styles.headerTitle}>{t('heteroAgent.executionTarget.title')}</span>
          <SimpleTooltip title={t('heteroAgent.executionTarget.infoTooltip')}>
            <span className={styles.headerInfo}>
              <span className="anticon" role="img">
                <InfoIcon fill={'transparent'} height={12} size={12} width={12} />
              </span>
            </span>
          </SimpleTooltip>
        </div>
        <button
          className={styles.manageButton}
          type="button"
          onClick={() => {
            setOpen(false);
            if (canSelectPersonalDevice) navigate('/settings/devices', { escape: true });
            else navigate('/settings/devices');
          }}
        >
          <span className="anticon" role="img">
            <SettingsIcon fill={'transparent'} height={11} size={11} width={11} />
          </span>
          <span>{t('heteroAgent.executionTarget.manage')}</span>
        </button>
      </div>
      {bindingInvalid ? (
        <div className={styles.empty}>
          {t('heteroAgent.executionTarget.bindingInvalidBanner', { device: boundDeviceId })}
        </div>
      ) : null}
      {isHetero ? null : (
        <OptionRow
          active={isActive('none')}
          desc={t('heteroAgent.executionTarget.noneDesc')}
          icon={<ExecutionTargetIcon target={'none'} />}
          label={t('heteroAgent.executionTarget.none')}
          onClick={() => void handleSelect('none')}
        />
      )}
      {isHetero ? null : (
        <OptionRow
          active={isActive('auto')}
          desc={t('heteroAgent.executionTarget.autoDesc')}
          icon={<ExecutionTargetIcon target={'auto'} />}
          label={t('heteroAgent.executionTarget.auto')}
          onClick={() => void handleSelect('auto')}
        />
      )}
      {/* `local` pins this desktop's personal `deviceId`. Available in both
          personal and workspace modes now : a workspace-agent
          `local` pick lands in `users.preference.agentDeviceOverrides` — my
          per-user override — so it never binds the workspace-shared
          `agencyConfig` or coerces any other member's dispatch. */}
      {isDesktop ? (
        <OptionRow
          active={isActive('local')}
          desc={t('heteroAgent.executionTarget.localDesc')}
          icon={<ExecutionTargetIcon target={'local'} />}
          label={t('heteroAgent.executionTarget.local')}
          onClick={() => void handleSelect('local', undefined, false)}
        />
      ) : null}
      {/* Same machine as the row above, fenced: writes confined to the working
          directory, network denied unless the switch opens the registry
          allowlist. Shown even when the host can't provide a sandbox — disabled,
          carrying the real reason, because "unavailable" here usually means
          "not installed yet" and silently hiding the feature would strand the
          user with no way to find out why. */}
      {isDesktop && supportsLocalShellSandbox ? (
        <OptionRow
          active={executionTarget === 'local' && localSandboxEnabled}
          disabled={!canUseLocalSandbox}
          label={t('heteroAgent.executionTarget.localSandbox')}
          desc={
            canUseLocalSandbox
              ? t(
                  localSandboxNetwork
                    ? 'heteroAgent.executionTarget.localSandboxDescNetwork'
                    : 'heteroAgent.executionTarget.localSandboxDesc',
                )
              : // Prefer the actionable instruction (Linux's "install this
                // package") over the backend's raw diagnostic when we have one.
                (sandboxCapability?.instructions ??
                t('heteroAgent.executionTarget.localSandboxUnavailable', {
                  reason: sandboxCapability?.reason ?? '',
                }))
          }
          extra={
            canUseLocalSandbox ? (
              <>
                <InstantSwitch
                  enabled={localSandboxNetwork}
                  size="sm"
                  onChange={handleToggleSandboxNetwork}
                />
                <SimpleTooltip title={t('heteroAgent.executionTarget.localSandboxNetworkTip')}>
                  <span className={styles.extraInfo}>
                    <span className="anticon" role="img">
                      <InfoIcon fill={'transparent'} height={12} size={12} width={12} />
                    </span>
                  </span>
                </SimpleTooltip>
              </>
            ) : sandboxCapability?.canInstall ? (
              // The backend is missing but we can provision it — a dead-end row
              // would leave the user to discover a CLI incantation on their own.
              <Button loading={isInstallingSandbox} size="sm" onClick={handleInstallSandbox}>
                {t('heteroAgent.executionTarget.localSandboxSetUp')}
              </Button>
            ) : undefined
          }
          icon={
            <span className="anticon" role="img">
              <ShieldCheckIcon fill={'transparent'} height={14} size={14} width={14} />
            </span>
          }
          onClick={() => void handleSelect('local', undefined, true)}
        />
      ) : null}
      {supportsSandbox ? (
        <OptionRow
          active={isActive('sandbox')}
          desc={t('heteroAgent.executionTarget.sandboxDesc')}
          icon={<ExecutionTargetIcon target={'sandbox'} />}
          label={t('heteroAgent.executionTarget.sandbox')}
          onClick={() => void handleSelect('sandbox')}
        />
      ) : null}
      {deviceRows.length > 0 ? (
        showDeviceGroups ? (
          <>
            {privateDevices.length > 0 ? (
              <>
                <div className={styles.groupLabel}>
                  {t('heteroAgent.executionTarget.personalGroup')}
                </div>
                <div className={styles.deviceList}>
                  {privateDevices.map((d) => renderDeviceRow(d))}
                </div>
              </>
            ) : null}
            {workspaceDevices.length > 0 ? (
              <>
                <div className={styles.groupLabel}>
                  {t('heteroAgent.executionTarget.workspaceGroup')}
                </div>
                <div className={styles.deviceList}>
                  {workspaceDevices.map((d) => renderDeviceRow(d))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className={styles.deviceList}>
            {personalOnlyDevices.map((d) => renderDeviceRow(d))}
          </div>
        )
      ) : null}
      {deviceInventoryError ? (
        <AsyncError
          error={deviceInventoryError}
          variant={'inline'}
          onRetry={() => void refreshDevices()}
        />
      ) : null}
      {devicesLoading ? (
        <div className={styles.empty}>{t('heteroAgent.executionTarget.loading')}</div>
      ) : null}
      {/* Workspace agent with no workspace device: personal machines are
          suppressed above, so guide the user to enroll one into the shared
          pool instead of showing a bare menu. */}
      {showWorkspaceEnrollHint ? (
        <div className={styles.empty}>
          {t('heteroAgent.executionTarget.noWorkspaceDevices', {
            cmd: `orvilo connect --workspace ${agentWorkspaceId}`,
          })}
        </div>
      ) : null}
      {/* On web with no remote device, guide the user to the desktop app (which
          unlocks local execution + `orvilo connect`) rather than a muted dead-end. */}
      {showWebDownloadCard ? (
        <a className={styles.option} href={DOWNLOAD_URL.default} rel="noreferrer" target="_blank">
          <div className={styles.optionIcon}>
            <span className="anticon" role="img">
              <MonitorDownIcon fill={'transparent'} height={14} size={14} width={14} />
            </span>
          </div>
          <div className={styles.optionMeta}>
            <div className={styles.optionTitle}>
              {t('heteroAgent.executionTarget.downloadDesktopTitle')}
            </div>
            <div className={styles.desc}>
              {t('heteroAgent.executionTarget.downloadDesktopDesc')}
            </div>
          </div>
          <span className="anticon flex-none" role="img">
            <ExternalLinkIcon fill={'transparent'} height={13} size={13} width={13} />
          </span>
        </a>
      ) : null}
      {hasNoDevices && isDesktop && !isWorkspaceAgent ? (
        <div className={styles.empty}>{t('heteroAgent.executionTarget.noDevices')}</div>
      ) : null}
    </div>
  );

  const chip = (
    <div
      className={cx(
        styles.button,
        open && styles.buttonOpen,
        !canShowExecutionTargetSelector && styles.buttonReadonly,
        bindingInvalid && styles.buttonWarning,
      )}
    >
      {chipIcon}
      <span data-workspace-label className={styles.buttonLabel}>
        {chipLabel}
      </span>
      {canShowExecutionTargetSelector ? (
        <span className="anticon" role="img">
          <ChevronDownIcon fill={'transparent'} height={12} size={12} width={12} />
        </span>
      ) : null}
    </div>
  );

  // Locked: the selector is hidden either because the author fixed the target
  // in the Agent Profile (`canSelectExecutionTarget` off) or because there is
  // simply nothing else to pick (≤1 candidate / inventory still resolving).
  // Name the environment and say the right reason — a 1-candidate state was
  // never "fixed in settings".
  if (!canShowExecutionTargetSelector)
    return (
      <SimpleTooltip
        title={formatLockedControlTooltip(
          chipLabel,
          canSelectExecutionTarget
            ? t('heteroAgent.executionTarget.readOnlyTip')
            : t('heteroAgent.executionTarget.fixedTip'),
        )}
      >
        {chip}
      </SimpleTooltip>
    );

  return (
    <Popover open={isActiveTab && open} onOpenChange={setOpen}>
      <PopoverTrigger>{chip}</PopoverTrigger>
      <PopoverContent align={'start'} className={'w-auto'} side={'top'} style={{ padding: 4 }}>
        {content}
      </PopoverContent>
    </Popover>
  );
});

HeteroDeviceSwitcher.displayName = 'HeteroDeviceSwitcher';

export default HeteroDeviceSwitcher;
