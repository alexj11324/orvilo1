'use client';

import { isDesktop } from '@orvilo/const';
import {
  type HeterogeneousAgentRuntimeState,
  type HeterogeneousAgentRuntimeStatus,
  useWatchBroadcast,
} from '@orvilo/electron-client-ipc';
import { resolveHeteroCliAgentType } from '@orvilo/types';
import { cn } from 'cn';
import { ActivityIcon, RadioTowerIcon, TimerResetIcon } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import HeteroDeviceSwitcher from '@/features/ChatInput/ControlBar/HeteroDeviceSwitcher';
import WorkspaceControls from '@/features/ChatInput/ControlBar/WorkspaceControls';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { SimpleTooltip } from '../../SimpleTooltip';
import ApprovalMode from '../ApprovalMode';
import { PermissionSelector } from './PermissionSelector';
import { ClaudeCodeQuotaMenu, CodexQuotaMenu } from './QuotaMenu';

const styles = {
  bar: '[container:runtimebar_/_inline-size] flex-none h-7 py-0 px-1',
  fullAccessLabel: '[@container_runtimebar_(width_<_600px)]:hidden',
  sdkRuntime:
    'cursor-default flex flex-none gap-1.5 items-center py-0.5 px-1 rounded-(--radius-chip) text-[12px] text-info whitespace-nowrap bg-[color-mix(in_srgb,_var(--ant-color-info-bg)_55%,_transparent)] bg-none',
  sdkRuntimeClosing:
    'text-[var(--ant-color-text-description)] bg-[var(--ant-color-fill-quaternary)] bg-none',
  sdkRuntimeError:
    'text-destructive bg-[color-mix(in_srgb,_var(--ant-color-error-bg)_55%,_transparent)] bg-none',
  sdkRuntimeIdle: 'text-muted-foreground bg-[var(--ant-color-fill-quaternary)] bg-none',
  sdkRuntimeMonitoring:
    'text-warning bg-[color-mix(in_srgb,_var(--ant-color-warning-bg)_55%,_transparent)] bg-none',
  sdkRuntimeStale:
    'text-warning bg-[color-mix(in_srgb,_var(--ant-color-warning-bg)_55%,_transparent)] bg-none',
  leftGroup:
    '[scrollbar-width:none] overflow-x-auto overflow-y-hidden flex-1 min-w-0 [&::-webkit-scrollbar]:hidden [@container_runtimebar_(width_<_720px)]:[&_[data-workspace-label]]:max-w-[clamp(0px,_calc(33.333cqw_-_100px),_120px)]',
  rightGroup: 'flex-none',
};

const visibleSdkRuntimeStates = new Set<HeterogeneousAgentRuntimeState>([
  'starting',
  'running',
  'monitoring',
  'idle',
  'stale',
  'closing',
  'error',
]);

const HeteroControlBar = memo(() => {
  const { t: tChat } = useTranslation('chat');
  const agentId = useAgentId();
  const { canConfigureResource, isAccessLoading } = useChatInputResourceAccess();
  const [runtimeStatus, setRuntimeStatus] = useState<HeterogeneousAgentRuntimeStatus>();

  useWatchBroadcast('heteroAgentRuntimeStatus', (status) => {
    // 'claude-sdk' is the legacy in-process transport label kept for archived
    // statuses; live Claude Code ACP runs report 'claude-code-acp'.
    if (status.transport !== 'claude-sdk' && status.transport !== 'claude-code-acp') return;
    setRuntimeStatus(status);
  });

  // All hooks must be called unconditionally (Rules of Hooks)
  const isLoading = useAgentStore(agentByIdSelectors.isAgentConfigLoadingById(agentId));
  // Effective config = shared row + this member's device override,
  // so the quota badges gate on where THIS member's run actually executes.
  const { agencyConfig, workspaceScoped } = useTopicAgencyConfig(agentId);

  const heteroProvider = agencyConfig?.heterogeneousProvider;
  const executionTarget = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: isDesktop,
    isHetero: !!heteroProvider,
    workspaceScoped,
  });
  const isLocalHeteroExecution = executionTarget === 'local';
  // An explicit bound device (including web's device-upgraded "local" pick)
  // samples quota through the gateway; `auto` has no concrete device to ask
  // and the cloud sandbox has no sampler, so both stay quota-less.
  const quotaDeviceId = executionTarget === 'device' ? agencyConfig?.boundDeviceId : undefined;
  // The builtin Orvilo harness executes through its engine's CLI family, so
  // quota/runtime badges gate on the resolved family rather than the declared
  // provider type — an orvilo claude-sdk session is a Claude subscription run.
  const heteroCliType = resolveHeteroCliAgentType(heteroProvider);
  const shouldShowClaudeQuota =
    heteroCliType === 'claude-code' && (isLocalHeteroExecution || !!quotaDeviceId);

  if (isAccessLoading) return null;

  // A can-use collaborator may choose only their execution device; working
  // directory, git, provider quota and runtime details remain author/editor config.
  if (!canConfigureResource) {
    if (!agentId || isLoading) return null;
    return (
      <div className={cn('flex flex-row items-center justify-between', styles.bar)}>
        <HeteroDeviceSwitcher agentId={agentId} />
      </div>
    );
  }

  // On web there's no full-access badge / skeleton — just the workspace
  // controls (the cloud repo switcher is rendered inside WorkspaceControls)
  // plus the Claude quota badge when the run executes on a bound device that
  // can sample it. The CLI model + thinking-effort selector now lives in the
  // input's bottom-left action bar (see HeterogeneousChatInput), not here.
  if (!isDesktop) {
    if (!agentId) return null;
    return (
      <div className={cn('flex flex-row items-center justify-between', styles.bar)}>
        <div className={cn('flex flex-row items-center gap-1', styles.leftGroup)}>
          <WorkspaceControls alwaysShowWorkspace agentId={agentId} />
        </div>
        <div className={cn('flex flex-row items-center gap-1', styles.rightGroup)}>
          {heteroProvider?.type === 'orvilo' ? (
            <ApprovalMode />
          ) : (
            <PermissionSelector agentId={agentId} />
          )}
          {shouldShowClaudeQuota && quotaDeviceId && (
            <div className={cn('flex flex-row items-center gap-1', styles.rightGroup)}>
              <ClaudeCodeQuotaMenu
                agentId={agentId}
                deviceId={quotaDeviceId}
                env={heteroProvider?.env}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!agentId || isLoading) {
    return (
      <div className={cn('flex flex-row items-center gap-1 justify-between', styles.bar)}>
        <Skeleton style={{ height: 22, minWidth: 100, width: 100 }} />
        <Skeleton style={{ height: 22, minWidth: 80, width: 80 }} />
      </div>
    );
  }

  // Codex quota still needs the local CLI (spawned over IPC), so it stays
  // desktop-local; the runtime badge likewise reports this desktop's own ACP
  // runtime, not a remote device's.
  const shouldShowCodexQuota = heteroCliType === 'codex' && isLocalHeteroExecution;
  const shouldShowSdkRuntime =
    heteroCliType === 'claude-code' &&
    isLocalHeteroExecution &&
    (runtimeStatus?.transport === 'claude-sdk' || runtimeStatus?.transport === 'claude-code-acp') &&
    visibleSdkRuntimeStates.has(runtimeStatus.state);
  const sdkRuntimeClassName =
    runtimeStatus?.state === 'monitoring'
      ? styles.sdkRuntimeMonitoring
      : runtimeStatus?.state === 'idle'
        ? styles.sdkRuntimeIdle
        : runtimeStatus?.state === 'stale'
          ? styles.sdkRuntimeStale
          : runtimeStatus?.state === 'closing'
            ? styles.sdkRuntimeClosing
            : runtimeStatus?.state === 'error'
              ? styles.sdkRuntimeError
              : undefined;
  const sdkRuntimeIcon =
    runtimeStatus?.state === 'monitoring'
      ? RadioTowerIcon
      : runtimeStatus?.state === 'idle' || runtimeStatus?.state === 'closing'
        ? TimerResetIcon
        : ActivityIcon;
  const sdkRuntimeBadge = shouldShowSdkRuntime ? (
    <SimpleTooltip
      title={tChat('heteroAgent.claudeSdkRuntime.tooltip', {
        count: runtimeStatus.activeTasks.length,
        state: tChat(`heteroAgent.claudeSdkRuntime.state.${runtimeStatus.state}`),
      })}
    >
      <div className={cn(styles.sdkRuntime, sdkRuntimeClassName)}>
        <span className="anticon" role="img">
          {createElement(sdkRuntimeIcon, { size: 14, width: 14, height: 14, fill: 'transparent' })}
        </span>
        <span className={styles.fullAccessLabel}>
          {tChat(`heteroAgent.claudeSdkRuntime.state.${runtimeStatus.state}`)}
        </span>
      </div>
    </SimpleTooltip>
  ) : null;

  return (
    <div className={cn('flex flex-row items-center justify-between', styles.bar)}>
      <div className={cn('flex flex-row items-center gap-1', styles.leftGroup)}>
        <WorkspaceControls alwaysShowWorkspace agentId={agentId} />
      </div>
      <div className={cn('flex flex-row items-center gap-1', styles.rightGroup)}>
        {shouldShowCodexQuota && (
          <CodexQuotaMenu command={heteroProvider?.command} env={heteroProvider?.env} />
        )}
        {shouldShowClaudeQuota && (
          <ClaudeCodeQuotaMenu
            agentId={agentId}
            deviceId={quotaDeviceId}
            env={heteroProvider?.env}
          />
        )}
        {sdkRuntimeBadge}
        {heteroProvider?.type === 'orvilo' ? (
          <ApprovalMode />
        ) : (
          <PermissionSelector agentId={agentId} />
        )}
      </div>
    </div>
  );
});

HeteroControlBar.displayName = 'HeteroControlBar';

export default HeteroControlBar;
