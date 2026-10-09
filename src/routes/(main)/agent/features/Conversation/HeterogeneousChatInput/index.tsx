'use client';

import { type ChatInputActionsProps } from '@lobehub/editor/react';
import {
  canMountBuiltinToolSurface,
  HETEROGENEOUS_TYPE_LABELS,
} from '@orvilo/heterogeneous-agents';
import { TriangleAlertIcon } from 'lucide-react';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useHeteroAgentCloudConfig } from '@/business/client/hooks/useHeteroAgentCloudConfig';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isDesktop } from '@/const/version';
import ChatInput from '@/features/AssistantChat/Composer';
import { type ActionKeys } from '@/features/ChatInput';
import HeteroControlBar from '@/features/ChatInput/ControlBar/HeteroControlBar';
import { contextSelectors, useConversationStore } from '@/features/Conversation/store';
import { useProviderBindingValidation } from '@/features/HeterogeneousAgent/hooks/useProviderBinding';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import {
  isHeterogeneousSandboxExecutionAvailable,
  resolveExecutionTarget,
} from '@/helpers/executionTarget';
import { resolveProviderBindingGuard } from '@/helpers/providerBinding';
import { useRemoteAgentDeviceGuard } from '@/hooks/useRemoteAgentDeviceGuard';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { useChatStore } from '@/store/chat';

import HeteroPlus from './HeteroPlus';
import ScheduledSendChip from './ScheduledSendChip';

// Heterogeneous agents (e.g. Claude Code) bring their own toolchain and memory,
// so most Orvilo-side pickers don't apply. MCP-capable runtimes keep the
// existing tool selector; `extraActionItems` provides a hetero-only `+` menu
// (formatting toolbar + "Send later") in the input's bottom-left corner.
//
// The right side carries the agent selector and nothing else: the CLI's model
// and its thinking effort are the agent's own Engine config, not picks the
// composer offers per conversation.
export const getHeterogeneousComposerLeftActions = (providerType?: string): ActionKeys[] =>
  canMountBuiltinToolSurface({ type: providerType }) ? ['tools'] : [];
const rightActions: ActionKeys[] = ['agent'];

/**
 * GuardBanner
 *
 * A deliberately thin, single-line warning that sits just above the input. We
 * fold the headline and the hint onto one line (no separate `description`
 * block, no oversized 24px icon) so the guard stays a compact strip instead of
 * eating a chunk of the conversation area.
 */
const GuardBanner = memo<{ action?: ReactNode; hint?: string; title: string }>(
  ({ title, hint, action }) => (
    <WideScreenContainer>
      <div className="flex flex-col items-center px-3" style={{ paddingBlock: '0 8px' }}>
        <Alert style={{ maxWidth: 880, width: '100%' }} variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            <div className="flex items-baseline gap-1.5" style={{ flexWrap: 'wrap' }}>
              <span>{title}</span>
              {hint && <span style={{ fontWeight: 400, opacity: 0.75 }}>{hint}</span>}
            </div>
          </AlertTitle>
          {action ? <AlertAction>{action}</AlertAction> : null}
        </Alert>
      </div>
    </WideScreenContainer>
  ),
);

GuardBanner.displayName = 'GuardBanner';

/**
 * HeterogeneousChatInput
 *
 * Simplified ChatInput for heterogeneous agents (Claude Code, etc.).
 * Keeps only: text input, typo toggle, send button, and a working-directory
 * picker and supported builtin tools — no model/memory/KB/runtime-mode/upload.
 *
 * In cloud (web) mode, shows a configuration prompt and disables the input
 * until the user sets up their cloud credentials in agent profile.
 */
const HeterogeneousChatInput = memo(() => {
  const { t } = useTranslation('chat');
  // Scope every hetero check to the conversation's agent. Passing `agentId`
  // into the cloud-credential and device guards keeps them validating the same
  // agent that `agencyConfig`/`isDeviceExecution` are computed from, instead of
  // the global (hijack-prone) active agent.
  const agentId = useConversationStore(contextSelectors.agentId);
  const { isConfigured, goToConfig } = useHeteroAgentCloudConfig(agentId);
  const navigate = useWorkspaceAwareNavigate();

  // Effective config = shared row + this member's per-agent device override
  // — the raw shared `agencyConfig` may carry another member's
  // device pick, which would drive the guard/model-selector gates off the
  // wrong machine.
  // While the preference is loading, the merged config may still reflect only
  // the shared row — hold the input closed (below) instead of gating device
  // runs off a value that can flip once the override arrives.
  const { agencyConfig, isPreferenceLoading, workspaceScoped } = useTopicAgencyConfig(agentId);
  const heterogeneousProvider = agencyConfig?.heterogeneousProvider;
  const providerType = heterogeneousProvider?.type;
  const leftActions = getHeterogeneousComposerLeftActions(providerType);
  const isApiAuth = heterogeneousProvider?.authMode === 'api';
  const providerApiConfig =
    isApiAuth &&
    heterogeneousProvider.apiConfig &&
    heterogeneousProvider.apiConfig.source !== 'server-default'
      ? heterogeneousProvider.apiConfig
      : undefined;
  const apiConfigMissing = isApiAuth && !heterogeneousProvider.apiConfig;
  const executionTarget = resolveExecutionTarget(agencyConfig, {
    isHetero: !!providerType,
    clientExecutionAvailable: isDesktop,
    workspaceScoped,
  });
  const { error: apiBindingValidationError, isReady: isApiBindingStateReady } =
    useProviderBindingValidation(providerType, providerApiConfig);
  const deviceSelectionRequired =
    !!providerType &&
    !isHeterogeneousSandboxExecutionAvailable(providerType) &&
    executionTarget === 'none';

  const apiModeTargetUnsupported = isApiAuth && executionTarget !== 'local';
  const validateProviderBinding =
    (apiConfigMissing || !!providerApiConfig) && executionTarget === 'local';
  const { blocked: apiModeBindingBlocked, error: apiModeBindingError } =
    resolveProviderBindingGuard({
      active: validateProviderBinding,
      error: apiBindingValidationError,
      isReady: isApiBindingStateReady,
    });
  // The armed-schedule chip sits immediately after the `+` that armed it, so the
  // state and the control that produced it read as one unit.
  const extraActionItems = useMemo<ChatInputActionsProps['items']>(
    () => [
      { alwaysDisplay: true, children: <HeteroPlus />, key: 'heteroPlus' },
      { alwaysDisplay: true, children: <ScheduledSendChip />, key: 'scheduledSendChip' },
    ],
    [],
  );

  // A run goes to an `orvilo connect` device when its execution target resolves to a
  // bound device (including desktop "local" opened from web). The
  // bound device must be online before we let the user send — guard it here
  // instead of failing at dispatch time.
  const isDeviceExecution = executionTarget === 'device' && !!agencyConfig?.boundDeviceId;

  const { status, refresh } = useRemoteAgentDeviceGuard({ agentId, enabled: isDeviceExecution });

  const goToAgentProfile = () => {
    if (agentId) navigate(`/settings/agents/${agentId}`);
  };

  const deviceBlocked =
    isDeviceExecution &&
    (status === 'device-offline' || status === 'platform-unavailable' || status === 'no-device');

  const renderDeviceGuard = () => {
    if (!deviceBlocked) return null;

    let title: string;
    let desc: string;

    if (status === 'no-device') {
      title = t('platformAgent.deviceGuard.noDevice.title');
      desc = t('platformAgent.deviceGuard.noDevice.desc');
    } else if (status === 'device-offline') {
      title = t('platformAgent.deviceGuard.deviceOffline.title');
      desc = t('platformAgent.deviceGuard.deviceOffline.desc');
    } else {
      // `platform-unavailable` only arises for remote-typed agents (the guard's
      // capability check), so providerType is always set here — fall back safely.
      const name = (providerType && HETEROGENEOUS_TYPE_LABELS[providerType]) || providerType || '';
      title = t('platformAgent.deviceGuard.platformUnavailable.title', { name });
      desc = t('platformAgent.deviceGuard.platformUnavailable.desc', { name });
    }

    return (
      <GuardBanner
        hint={desc}
        title={title}
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={refresh}>
              {t('platformAgent.deviceGuard.refresh')}
            </Button>
            <Button size="sm" onClick={goToAgentProfile}>
              {t('platformAgent.deviceGuard.configure')}
            </Button>
          </div>
        }
      />
    );
  };

  const renderCloudConfigGuard = () => {
    // Until the override loads, `isDeviceExecution` may be a false negative —
    // don't flash the cloud-config prompt for what turns out to be a device run.
    if (isPreferenceLoading || deviceSelectionRequired || isDeviceExecution || isConfigured) {
      return null;
    }

    return (
      <GuardBanner
        hint={t('heteroAgent.cloudNotConfigured.desc')}
        title={t('heteroAgent.cloudNotConfigured.title')}
        action={
          <Button size="sm" onClick={goToConfig}>
            {t('heteroAgent.cloudNotConfigured.action')}
          </Button>
        }
      />
    );
  };

  const renderApiModeTargetGuard = () => {
    if (!apiModeTargetUnsupported) return null;

    return (
      <GuardBanner
        hint={t('heteroAgent.apiMode.localOnly.desc')}
        title={t('heteroAgent.apiMode.localOnly.title')}
        action={
          <Button size="sm" onClick={goToAgentProfile}>
            {t('platformAgent.deviceGuard.configure')}
          </Button>
        }
      />
    );
  };

  const renderApiModeBindingGuard = () => {
    if (!apiModeBindingError) return null;

    const title =
      apiModeBindingError.code === 'configMissing'
        ? t('heteroAgent.apiMode.configMissing')
        : apiModeBindingError.code === 'agentUnsupported'
          ? t('heteroAgent.apiMode.agentUnsupported', { name: providerType })
          : t(`heteroAgent.apiMode.${apiModeBindingError.code}`, apiModeBindingError);

    return (
      <GuardBanner
        title={title}
        action={
          <Button size="sm" onClick={goToAgentProfile}>
            {t('platformAgent.deviceGuard.configure')}
          </Button>
        }
      />
    );
  };

  const renderDeviceSelectionGuard = () => {
    if (!deviceSelectionRequired) return null;

    return (
      <GuardBanner
        title={t('platformAgent.deviceGuard.noDevice.title')}
        hint={t('heteroAgent.executionTarget.sandboxUnsupported', {
          name: providerType ? HETEROGENEOUS_TYPE_LABELS[providerType] : undefined,
        })}
      />
    );
  };

  // Device execution doesn't use the cloud sandbox, so it doesn't need cloud
  // credentials — only the sandbox path gates on `isConfigured`. While the
  // workspace preference loads, keep send disabled: the effective target isn't
  // known yet, so neither guard can vouch for the run.
  const inputDisabled =
    apiModeTargetUnsupported ||
    apiModeBindingBlocked ||
    isPreferenceLoading ||
    deviceSelectionRequired ||
    (!isConfigured && !isDeviceExecution) ||
    deviceBlocked;
  const hasGuard =
    apiModeTargetUnsupported ||
    !!apiModeBindingError ||
    apiModeBindingBlocked ||
    deviceSelectionRequired ||
    deviceBlocked ||
    (!isConfigured && !isDeviceExecution);

  return (
    <div className="flex flex-col">
      {renderApiModeTargetGuard()}
      {renderApiModeBindingGuard()}
      {renderDeviceSelectionGuard()}
      {renderCloudConfigGuard()}
      {renderDeviceGuard()}
      <ChatInput
        // Same composer parity as MainChatInput: the hetero control strip floats
        // under the card rather than inside its footer, and the editor opens at
        // one text row (~24px) instead of the shared two-row default.
        allowExpand={false}
        controlBarSlot={<HeteroControlBar />}
        editorDefaultRows={1}
        extraActionItems={extraActionItems}
        leftActions={leftActions}
        rightActions={rightActions}
        sendButtonProps={{ disabled: inputDisabled, shape: 'round' }}
        skipScrollMarginWithList={!hasGuard}
        onEditorReady={(instance) => {
          // Sync to global ChatStore for compatibility with other features
          useChatStore.setState({ mainInputEditor: instance });
        }}
      />
    </div>
  );
});

HeterogeneousChatInput.displayName = 'HeterogeneousChatInput';

export default HeterogeneousChatInput;
