'use client';

import { DEFAULT_INBOX_TITLE } from '@orvilo/const';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { AgentItem, HeterogeneousReasoningEffort } from '@orvilo/types';
import { HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { CheckIcon, Loader2, PencilIcon, RefreshCw } from 'lucide-react';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { ProductLogo } from '@/components/Branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ApiAgentSetup from '@/features/AgentOnboarding/ApiAgentSetup';
import { isBuiltinAgentUsable } from '@/features/AgentOnboarding/availability';
import { getEffortLabelKeys } from '@/features/ChatInput/ControlBar/HeteroModel/labels';
import { buildConnectAgentConfig, getConnectableProvider } from '@/features/ConnectAgent/providers';
import { useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import { getDeviceLabel } from '@/features/DeviceManager/getDeviceLabel';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { CreateAgentParams } from '@/services/agent';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
  firstPrimeAgentConfig,
  verifyFirstAgentDevice,
} from '@/services/agentOnboarding';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { providerBindingService } from '@/services/providerBinding';
import { useAgentStore } from '@/store/agent';
import { heteroAgentDefaultName } from '@/store/agent/utils/heteroAgentDefaultName';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';

import {
  type AgentChoice,
  BUILTIN_AGENT_KEY,
  effortOptionsFor,
  hasEffortStep,
  hasModelStep,
  installedProviders,
} from './agentOptions';
import { useAgentModelOptions } from './useAgentModelOptions';
import { useExecutionHost } from './useExecutionHost';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  footer: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
  `,
  hint: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;

    padding-block: 24px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  iconBox: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  nameInput: css`
    max-width: 320px;
    font-size: 15px;
    font-weight: 600;
  `,
  nameRow: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 32px;
  `,
  nameText: css`
    overflow: hidden;

    font-size: 15px;
    font-weight: 600;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  notice: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;

    padding: 16px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  root: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
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
  rowSelected: css`
    background: ${cssVar.colorFillTertiary};
  `,
  rowStatic: css`
    cursor: default;

    &:hover {
      background: transparent;
    }
  `,
  rowText: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    min-width: 0;
  `,
  rowTitle: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  runsOn: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  sectionLabel: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  skeletonBar: css`
    height: 12px;
    border-radius: 6px;
    background: ${cssVar.colorFillSecondary};
    animation: orvilo-create-agent-pulse 1.4s ease-in-out infinite;

    @keyframes orvilo-create-agent-pulse {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.45;
      }
    }
  `,
}));

interface OptionRowProps {
  checked: boolean;
  icon?: ReactNode;
  onSelect?: () => void;
  subtitle?: ReactNode;
  title: ReactNode;
}

/**
 * One selectable row. Selection is a radio-style pick rendered as a check —
 * no engineering chrome (no flags, ids, versions) ever reaches this row: the
 * title is the product name, the subtitle optional friendly detail.
 */
const OptionRow = memo<OptionRowProps>(({ checked, icon, onSelect, subtitle, title }) => (
  <div
    aria-checked={checked}
    className={cx(styles.row, checked && styles.rowSelected)}
    role={'radio'}
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect?.();
    }}
  >
    {icon && <span className={styles.iconBox}>{icon}</span>}
    <div className={styles.rowText}>
      <div className={styles.rowTitle}>{title}</div>
      {subtitle}
    </div>
    {checked && <CheckIcon size={16} />}
  </div>
));

OptionRow.displayName = 'CreateAgentOptionRow';

export interface CreateAgentPanelProps {
  /** Idempotent create intent — pass when retries must not mint twin agents. */
  creationCheckpoint?: FirstAgentCreationCheckpoint;
  groupId?: string;
  /** Pre-picked harness (e.g. a "Create" row in the composer picker). */
  initialType?: HeterogeneousAgentType;
  onCreated?: (agentId: string, config?: Partial<AgentItem>) => void | Promise<void>;
  visibility?: 'private' | 'public';
}

/**
 * The single agent-creation surface: name up top, then pick the agent, its
 * model and its strength — every engineering detail (runtime, version, ids,
 * flags) stays out. Sections only appear when the picked agent actually has
 * that dimension, so an effort-less harness shows two steps, not three.
 */
const CreateAgentPanel = ({
  creationCheckpoint,
  groupId,
  initialType,
  onCreated,
  visibility,
}: CreateAgentPanelProps) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { scan, state } = useAgentScan();
  const host = useExecutionHost();
  const bindings = useProviderBindingStore((s) => s.bindings);
  useFetchProviderBindings();
  const workspaceId = useActiveWorkspaceId();
  const createAgent = useAgentStore((s) => s.createAgent);

  const builtinUsable = isBuiltinAgentUsable(bindings);
  const installed = installedProviders(state.agents);

  const [selected, setSelected] = useState<AgentChoice | undefined>(initialType);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [model, setModel] = useState<string>(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  const [effort, setEffort] = useState<HeterogeneousReasoningEffort>(
    HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  );
  const [apiSetup, setApiSetup] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>();
  const builtinCheckpoint = useRef<FirstAgentCreationCheckpoint>({
    requestId: crypto.randomUUID(),
  });

  const supportsLocal = heterogeneousAgentService.supportsLocalExecution;

  // Probe the resolved host once it settles: this computer through the desktop
  // binary detector, an online personal device through the device gateway.
  useEffect(() => {
    if (host.loading) return;
    if (host.isLocal) {
      if (supportsLocal) void scan({ kind: 'local' });
      return;
    }
    if (host.device) void scan({ device: host.device, kind: 'device' });
  }, [host.device, host.isLocal, host.loading, scan, supportsLocal]);

  // Preselect the product agent when it can actually run; a caller's
  // initialType or the user's own pick always wins.
  useEffect(() => {
    if (selected !== undefined) return;
    setSelected(BUILTIN_AGENT_KEY);
  }, [selected]);

  const selectedProvider =
    selected && selected !== BUILTIN_AGENT_KEY ? getConnectableProvider(selected) : undefined;
  const selectedType = selectedProvider?.type;

  // The name follows the pick until the user takes ownership of the field.
  useEffect(() => {
    if (nameTouched || !selected) return;
    if (selected === BUILTIN_AGENT_KEY) {
      setName(DEFAULT_INBOX_TITLE);
      return;
    }
    setName(
      heteroAgentDefaultName({
        productTitle: selectedProvider?.title,
        visibility: visibility ?? 'private',
        workspaceId,
      }) ??
        selectedProvider?.title ??
        '',
    );
  }, [nameTouched, selected, selectedProvider?.title, visibility, workspaceId]);

  const modelOptions = useAgentModelOptions({
    deviceId: host.deviceId,
    enabled: hasModelStep(selectedType),
    isLocal: host.isLocal,
    provider: selectedProvider,
  });
  const effortOptions = hasEffortStep(selectedType) ? effortOptionsFor(selectedType, model) : [];

  const effortLabelKeys = getEffortLabelKeys(selectedType);

  const selectAgent = (choice: AgentChoice) => {
    if (creating) return;
    setSelected(choice);
    setApiSetup(false);
    setModel(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    setEffort(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  };

  const runsOn =
    host.isLocal || !host.device
      ? t('connectAgent.create.localDevice')
      : getDeviceLabel(host.device, t('connectAgent.create.desktopChannel'));

  const handleBuiltinCreated = async (agentId: string, deviceId: string) => {
    await onCreated?.(agentId, { agencyConfig: { boundDeviceId: deviceId } });
  };

  const create = async () => {
    if (!selected || creating) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      if (selected === BUILTIN_AGENT_KEY) {
        if (!host.deviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        await verifyFirstAgentDevice(host.deviceId);
        const binding = bindings.find((item) => isBuiltinAgentUsable([item]));
        if (!binding) throw new Error('PROVIDER_CHECK_UNAVAILABLE');
        const check = await providerBindingService.checkConnection(binding.id, binding.revision);
        if (check.status !== 'ready') throw new Error('PROVIDER_CHECK_UNAVAILABLE');
        const result = await createOnboardingAgentOnce(
          builtinCheckpoint.current,
          {
            config: firstPrimeAgentConfig(binding.model, host.deviceId),
            visibility: visibility ?? 'private',
          },
          createAgent,
        );
        await onCreated?.(result.agentId, result.config);
        return;
      }

      if (!selectedProvider) throw new Error('CREATE_AGENT_NO_PROVIDER');
      const params: CreateAgentParams = {
        config: buildConnectAgentConfig({
          effort,
          model,
          overrides: { name },
          provider: selectedProvider,
          target: host.isLocal
            ? { deviceId: host.deviceId, kind: 'local' }
            : { deviceId: host.deviceId, kind: 'device' },
        }),
        groupId,
        visibility,
      };
      const result = creationCheckpoint
        ? await createOnboardingAgentOnce(creationCheckpoint, params, createAgent)
        : { ...(await createAgent(params)), config: params.config };
      await onCreated?.(result.agentId, result.config ?? params.config);
    } catch (error) {
      setCreateError(error);
    } finally {
      setCreating(false);
    }
  };

  const scanning = !host.loading && (state.status === 'idle' || state.status === 'scanning');
  const builtinSelected = selected === BUILTIN_AGENT_KEY;
  const showModelSection = builtinSelected ? builtinUsable : modelOptions.supported;
  const showStrengthSection = effortOptions.length > 0;
  const builtinBinding = bindings.find((item) => isBuiltinAgentUsable([item]));

  // Steps are numbered by which sections actually render — a harness without
  // capability steps keeps the count honest (opencode: Agent → Model).
  const agentStep = 1;
  const modelStep = showModelSection ? 2 : undefined;
  const strengthStep = showStrengthSection ? (showModelSection ? 3 : 2) : undefined;

  const commitName = () => setEditingName(false);

  return (
    <div className={styles.root}>
      {/* Name is the page's own heading: always editable via the pencil. */}
      <div className={styles.nameRow}>
        {editingName ? (
          <Input
            autoFocus
            className={styles.nameInput}
            placeholder={t('createAgent.namePlaceholder')}
            value={name}
            onBlur={commitName}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitName();
              if (event.key === 'Escape') setEditingName(false);
            }}
          />
        ) : (
          <>
            <span className={styles.nameText}>{name || t('createAgent.namePlaceholder')}</span>
            <ActionIcon
              icon={PencilIcon}
              size={'small'}
              title={t('createAgent.rename')}
              onClick={() => setEditingName(true)}
            />
          </>
        )}
      </div>
      <div className={styles.runsOn}>{t('createAgent.runsOn', { device: runsOn })}</div>

      <div className={styles.sectionLabel}>
        {t('createAgent.step', { step: agentStep, title: t('createAgent.step.agent') })}
      </div>
      <div className={styles.card}>
        {/* The product's own agent is always an option; a missing provider
            route swaps its model step for the credential setup below. */}
        <OptionRow
          checked={builtinSelected}
          icon={<ProductLogo size={20} type={'mono'} />}
          title={DEFAULT_INBOX_TITLE}
          onSelect={() => selectAgent(BUILTIN_AGENT_KEY)}
        />
        {scanning ? (
          <div className={styles.hint}>
            <Loader2 className={'animate-spin'} size={14} />
            {t('localHarness.scanning')}
          </div>
        ) : (
          installed.map((provider) => (
            <OptionRow
              checked={selected === provider.type}
              icon={<provider.brand.Avatar size={20} />}
              key={provider.type}
              title={provider.title}
              onSelect={() => selectAgent(provider.type)}
            />
          ))
        )}
        {!scanning && state.status === 'success' && installed.length === 0 && supportsLocal && (
          <div className={styles.notice}>
            <span>{t('createAgent.installHint')}</span>
            <Button
              size={'sm'}
              variant={'outline'}
              onClick={() => {
                if (host.isLocal) void scan({ kind: 'local' });
                else if (host.device) void scan({ device: host.device, kind: 'device' });
              }}
            >
              <RefreshCw data-icon={'inline-start'} size={13} />
              {t('createAgent.rescan')}
            </Button>
          </div>
        )}
      </div>

      {builtinSelected && !builtinUsable && !apiSetup && (
        <div className={styles.card}>
          <div className={styles.notice}>
            <span>{t('onboarding.prime.unavailable')}</span>
            <Button size={'sm'} onClick={() => setApiSetup(true)}>
              {t('onboarding.api.configure')}
            </Button>
          </div>
        </div>
      )}

      {apiSetup && <ApiAgentSetup deviceId={host.deviceId} onCreated={handleBuiltinCreated} />}

      {modelStep !== undefined && !apiSetup && (
        <>
          <div className={styles.sectionLabel}>
            {t('createAgent.step', { step: modelStep, title: t('createAgent.step.model') })}
          </div>
          <div className={styles.card}>
            {builtinSelected ? (
              <OptionRow
                checked
                title={builtinBinding?.model ?? t('heteroAgent.modelSelector.default')}
              />
            ) : modelOptions.loading ? (
              <div className={styles.hint}>
                <Loader2 className={'animate-spin'} size={14} />
                {t('createAgent.model.loading')}
              </div>
            ) : (
              <>
                <OptionRow
                  checked={model === HETEROGENEOUS_AGENT_DEFAULT_SELECTION}
                  title={t('heteroAgent.modelSelector.default')}
                  onSelect={() => setModel(HETEROGENEOUS_AGENT_DEFAULT_SELECTION)}
                />
                {modelOptions.options.map((option) => (
                  <OptionRow
                    checked={model === option.value}
                    key={option.value}
                    title={option.label}
                    onSelect={() => setModel(option.value)}
                  />
                ))}
                {modelOptions.error && (
                  <div className={styles.notice}>
                    <span>{t('createAgent.model.error')}</span>
                    <Button size={'sm'} variant={'outline'} onClick={modelOptions.retry}>
                      <RefreshCw data-icon={'inline-start'} size={13} />
                      {t('createAgent.retry')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {strengthStep !== undefined && !apiSetup && (
        <>
          <div className={styles.sectionLabel}>
            {t('createAgent.step', { step: strengthStep, title: t('createAgent.step.strength') })}
          </div>
          <div className={styles.card}>
            {effortOptions.map((option) => (
              <OptionRow
                checked={effort === option}
                key={option}
                title={t(effortLabelKeys[option])}
                onSelect={() => setEffort(option)}
              />
            ))}
          </div>
        </>
      )}

      {host.exhausted && (
        <div className={styles.card}>
          <div className={styles.notice}>
            <span>{t('createAgent.hostExhausted')}</span>
            <Button size={'sm'} variant={'outline'} onClick={() => navigate('/settings/devices')}>
              {t('createAgent.hostExhaustedAction')}
            </Button>
          </div>
        </div>
      )}

      {createError !== undefined && <AsyncError error={createError} />}

      {!apiSetup && (
        <div className={styles.footer}>
          <Button
            loading={creating}
            disabled={
              creating || !selected || host.exhausted || (builtinSelected && !builtinUsable)
            }
            onClick={() => void create()}
          >
            {t('createAgent.create')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CreateAgentPanel;
