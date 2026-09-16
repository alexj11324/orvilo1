'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import type { SelectOptions } from '@lobehub/ui/base-ui';
import { Button, Select, Text } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import {
  isRemoteHeterogeneousType,
  REMOTE_HETEROGENEOUS_AGENT_CONFIGS,
} from '@orvilo/heterogeneous-agents';
import { HETEROGENEOUS_AGENT_CLIENT_CONFIGS } from '@orvilo/heterogeneous-agents/client';
import type {
  HeterogeneousAgentMode,
  HeterogeneousAgentType,
  HeterogeneousProviderConfig,
  HeterogeneousReasoningEffort,
  HeterogeneousSpeedMode,
  ListHeterogeneousAgentModelsParams,
  OrviloEngineKind,
} from '@orvilo/types';
import {
  getHeteroSelectorCapability,
  getOrviloEngineCapabilities,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  normalizeHeterogeneousProviderConfig,
} from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { Cpu } from 'lucide-react';
import { memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PartialDeep } from 'type-fest';

import { ProductLogo } from '@/components/Branding';
import {
  getEffortLabelKeys,
  getModeLabelKey,
} from '@/features/ChatInput/ControlBar/HeteroModel/labels';
import { getStaticModelOptions } from '@/features/ChatInput/ControlBar/HeteroModel/modelOptions';
import { resolveModelSwitchSelection } from '@/features/ChatInput/ControlBar/HeteroModel/selectorView';
import { useModelCatalog } from '@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog';
import { getConnectableProvider } from '@/features/ConnectAgent/providers';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import {
  ExecutionTargetDeviceStatus,
  ExecutionTargetIcon,
  executionTargetValue,
  groupExecutionTargetDevices,
  parseExecutionTargetValue,
  resolveExecutionTargetSelection,
} from '@/features/ExecutionTargetPicker';
import {
  applyEngineAwareSelection,
  buildEngineProviderPatch,
  buildHarnessProviderPatch,
  DEFAULT_ORVILO_ENGINE,
  isBuiltinEngineType,
  ORVILO_ENGINE_KINDS,
  resolveOrviloEngineCliType,
} from '@/features/HeterogeneousAgent/engine';
import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import {
  isHeterogeneousSandboxExecutionAvailable,
  resolveExecutionTarget,
} from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, agentSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding-block: 16px 4px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block-end: 12px;
  `,
  detailContent: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;

    min-width: 0;
  `,
  detailLabel: css`
    flex-shrink: 0;

    width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  detailList: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  detailRow: css`
    display: flex;
    gap: 16px;
    align-items: center;

    min-height: 44px;
    padding-block: 6px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  hint: css`
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  optionIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;
  `,
  optionLabel: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  optionName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  select: css`
    min-width: 220px;
    max-width: 100%;
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
  `,
}));

/** Icon shown next to a harness name in the Harness select. */
const HarnessIcon = memo<{ type: HeterogeneousAgentType }>(({ type }) => {
  if (isBuiltinEngineType(type)) {
    return (
      <span className={styles.optionIcon}>
        <ProductLogo size={14} />
      </span>
    );
  }

  const Brand = getConnectableProvider(type)?.brand;
  if (!Brand) return null;

  return (
    <span className={styles.optionIcon}>
      <Brand.Avatar size={14} />
    </span>
  );
});

HarnessIcon.displayName = 'EngineConfigCard.HarnessIcon';

const HarnessOptionLabel = memo<{ name: string; type: HeterogeneousAgentType }>(
  ({ name, type }) => (
    <span className={styles.optionLabel}>
      <HarnessIcon type={type} />
      <span className={styles.optionName}>{name}</span>
    </span>
  ),
);

HarnessOptionLabel.displayName = 'EngineConfigCard.HarnessOptionLabel';

/** Labelled row of a target/device option, mirroring WorkspaceAgentDevicePolicy. */
const TargetOptionLabel = memo<{
  device?: { online: boolean; platform?: string | null };
  label: string;
  offlineLabel: string;
  onlineLabel: string;
  target: 'device' | 'local' | 'sandbox';
}>(({ device, label, offlineLabel, onlineLabel, target }) => (
  <span className={styles.optionLabel}>
    <span aria-hidden className={styles.optionIcon}>
      <ExecutionTargetIcon devicePlatform={device?.platform} target={target} />
    </span>
    <span className={styles.optionName}>{label}</span>
    {device ? (
      <ExecutionTargetDeviceStatus
        offlineLabel={offlineLabel}
        online={device.online}
        onlineLabel={onlineLabel}
      />
    ) : null}
  </span>
));

TargetOptionLabel.displayName = 'EngineConfigCard.TargetOptionLabel';

interface EngineConfigCardProps {
  agentId: string;
}

/**
 * Per-agent engine settings: which harness runs the agent, the builtin
 * Orvilo engine selection, per-harness model/effort/mode/speed, and where
 * runs execute. Everything persists through
 * `agencyConfig.heterogeneousProvider` / `executionTarget` / `boundDeviceId`
 * — the legacy `model`/`provider` fields are untouched.
 */
const EngineConfigCard = memo<EngineConfigCardProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'chat']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const rawProvider = config?.agencyConfig?.heterogeneousProvider;
  const provider = rawProvider ? normalizeHeterogeneousProviderConfig(rawProvider) : undefined;
  const isWorkspaceAgent = useAgentStore(agentByIdSelectors.isWorkspaceAgentById(agentId));
  const {
    agencyConfig: effectiveAgencyConfig,
    isPreferenceLoading,
    workspaceScoped,
  } = useEffectiveAgencyConfig(agentId);
  const { data: devices, isLoading: devicesLoading } = useDeviceList();
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const cwd = useEffectiveWorkingDirectory(agentId);

  // A missing provider is a legacy chat runtime. Keep that visible until the
  // user explicitly migrates it; displaying Orvilo here while dispatch still
  // chose client/gateway made the settings card disagree with actual runs.
  const legacyRuntime = !provider;
  const harnessType: HeterogeneousAgentType = provider?.type ?? 'orvilo';
  const builtinEngine = !legacyRuntime && isBuiltinEngineType(harnessType);
  const remoteEngine = isRemoteHeterogeneousType(harnessType);
  const selectorType = builtinEngine ? resolveOrviloEngineCliType(provider?.engine) : harnessType;
  const capability = legacyRuntime ? undefined : getHeteroSelectorCapability(selectorType);
  const engineCapabilities = builtinEngine
    ? getOrviloEngineCapabilities(provider?.engine)
    : undefined;

  const patchProvider = (patch: PartialDeep<HeterogeneousProviderConfig>) => {
    const nextType = patch.type ?? provider?.type ?? 'orvilo';
    const base: PartialDeep<HeterogeneousProviderConfig> = provider
      ? {}
      : {
          ...(isBuiltinEngineType(nextType) ? { engine: DEFAULT_ORVILO_ENGINE } : {}),
          type: nextType,
        };
    return updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...base, ...patch } },
    });
  };

  const harnessOptions = useMemo<SelectOptions>(() => {
    const option = (type: HeterogeneousAgentType, name: string) => ({
      label: <HarnessOptionLabel name={name} type={type} />,
      title: name,
      value: type,
    });

    return [
      option('orvilo', 'Orvilo'),
      {
        label: t('agentEngine.harness.localGroup'),
        options: HETEROGENEOUS_AGENT_CLIENT_CONFIGS.map(({ title, type }) => option(type, title)),
      },
      {
        label: t('agentEngine.harness.remoteGroup'),
        options: REMOTE_HETEROGENEOUS_AGENT_CONFIGS.map(({ title, type }) => option(type, title)),
      },
    ];
  }, [t]);

  const engineOptions = useMemo<SelectOptions>(
    () =>
      ORVILO_ENGINE_KINDS.map((engine) => {
        const cliType = resolveOrviloEngineCliType(engine);
        const name = t(
          engine === 'codex-app-server'
            ? 'agentEngine.engine.codexAppServer'
            : 'agentEngine.engine.claudeSdk',
        );
        return {
          label: <HarnessOptionLabel name={name} type={cliType} />,
          title: name,
          value: engine,
        };
      }),
    [t],
  );

  const model = capability?.model?.resolve(provider) ?? HETEROGENEOUS_AGENT_DEFAULT_SELECTION;
  const effort = capability?.effort?.resolve(provider);
  const mode = capability?.mode?.resolve(provider);
  const speedSupported = capability?.speed?.supported(model) ?? false;
  const speed: HeterogeneousSpeedMode = speedSupported
    ? capability!.speed!.resolve(provider)
    : HETEROGENEOUS_AGENT_DEFAULT_SELECTION;

  const effortLabelKeys = getEffortLabelKeys(selectorType);
  const defaultLabel = t('chat:heteroAgent.modelSelector.default');

  const modelOptions = useMemo<SelectOptions>(() => {
    if (capability?.model?.source !== 'static') return [];

    const base: SelectOptions = [
      { label: defaultLabel, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
      ...getStaticModelOptions(selectorType),
    ];

    return model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !base.some((option) => 'value' in option && option.value === model)
      ? [{ label: model, title: model, value: model }, ...base]
      : base;
  }, [capability?.model?.source, defaultLabel, model, selectorType]);

  const effortOptions = useMemo<SelectOptions>(() => {
    if (!capability?.effort || effort === undefined) return [];

    return [
      { label: defaultLabel, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
      ...capability.effort.levels(model).map((level) => ({
        label: t(`chat:${effortLabelKeys[level]}`),
        title: level,
        value: level,
      })),
    ];
  }, [capability?.effort, defaultLabel, effort, effortLabelKeys, model, t]);

  const modeOptions = useMemo<SelectOptions>(() => {
    if (!capability?.mode || mode === undefined) return [];

    return [
      { label: defaultLabel, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
      ...capability.mode.levels.map((level) => ({
        label: t(`chat:${getModeLabelKey(level)}`),
        title: level,
        value: level,
      })),
    ];
  }, [capability?.mode, defaultLabel, mode, t]);

  const speedOptions = useMemo<SelectOptions>(() => {
    if (!speedSupported) return [];

    return [
      {
        label: t('chat:heteroAgent.modelSelector.speed.standard'),
        value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
      },
      { label: t('chat:heteroAgent.modelSelector.speed.fast'), value: 'fast' },
    ];
  }, [speedSupported, t]);

  // Catalog-backed CLIs enumerate models on the machine the run targets, so
  // the picker only fills once the effective target resolves somewhere real.
  const [catalogOpen, setCatalogOpen] = useState(false);
  const effectiveTarget = resolveExecutionTarget(effectiveAgencyConfig, {
    clientExecutionAvailable: isDesktop,
    isHetero: true,
    workspaceScoped,
  });
  const targetDeviceId = resolveTargetDeviceId(effectiveAgencyConfig, currentDeviceId, {
    workspaceScoped,
  });
  const useLocalIpc = isDesktop && effectiveTarget === 'local';
  const catalogDeviceId = useLocalIpc ? undefined : targetDeviceId;
  const isCatalogModel = capability?.model?.source === 'catalog';
  const catalogTargetReady =
    isCatalogModel && (useLocalIpc || (effectiveTarget === 'device' && !!catalogDeviceId));
  const catalog = useModelCatalog({
    cwd,
    deviceId: catalogDeviceId,
    isDeviceListLoading: devicesLoading,
    isPreferenceLoading,
    open: catalogOpen,
    provider: isCatalogModel ? provider : undefined,
    targetReady: catalogTargetReady,
    type: harnessType as ListHeterogeneousAgentModelsParams['type'],
  });

  const catalogModelOptions = useMemo<SelectOptions>(() => {
    if (!isCatalogModel) return [];

    const models = catalog.data?.models ?? [];
    const staleCurrent =
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION && !models.some((item) => item.id === model);

    return [
      { label: defaultLabel, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
      ...(staleCurrent ? [{ label: model, title: model, value: model }] : []),
      ...models.map((item) => ({
        label: item.label ?? item.modelId,
        title: `${item.label ?? item.modelId} ${item.id}`,
        value: item.id,
      })),
    ];
  }, [catalog.data?.models, defaultLabel, isCatalogModel, model]);

  // Members pick their own environment on workspace agents (shared pool,
  // `WorkspaceAgentDevicePolicy` below); platform agents bind a device through
  // `RemoteAgentConfigCard`. The inline picker is for personal CLI/builtin
  // harnesses, which otherwise had no environment control in the profile.
  const showTargetPicker = !!provider && !remoteEngine && !isWorkspaceAgent;
  const supportsSandbox = isHeterogeneousSandboxExecutionAvailable(harnessType);
  const personalDevices = useMemo(() => groupExecutionTargetDevices(devices).personal, [devices]);

  const targetOptions = useMemo<SelectOptions>(() => {
    if (!showTargetPicker) return [];

    const offlineLabel = t('chat:heteroAgent.executionTarget.offline');
    const onlineLabel = t('chat:heteroAgent.executionTarget.online');
    const shared: SelectOptions = [
      ...(isDesktop
        ? [
            {
              label: (
                <TargetOptionLabel
                  label={t('chat:heteroAgent.executionTarget.local')}
                  offlineLabel={offlineLabel}
                  onlineLabel={onlineLabel}
                  target={'local'}
                />
              ),
              title: t('chat:heteroAgent.executionTarget.local'),
              value: executionTargetValue('local'),
            },
          ]
        : []),
      {
        disabled: !supportsSandbox,
        label: (
          <TargetOptionLabel
            label={t('chat:heteroAgent.executionTarget.sandbox')}
            offlineLabel={offlineLabel}
            onlineLabel={onlineLabel}
            target={'sandbox'}
          />
        ),
        title: t('chat:heteroAgent.executionTarget.sandbox'),
        value: executionTargetValue('sandbox'),
      },
    ];

    const deviceOptions: SelectOptions = devicesLoading
      ? [
          {
            disabled: true,
            label: t('chat:heteroAgent.executionTarget.loading'),
            value: 'status:loading',
          },
        ]
      : personalDevices.map((device) => ({
          label: (
            <TargetOptionLabel
              device={device}
              label={device.friendlyName || device.hostname || device.deviceId}
              offlineLabel={offlineLabel}
              onlineLabel={onlineLabel}
              target={'device'}
            />
          ),
          title: device.friendlyName || device.hostname || device.deviceId,
          value: executionTargetValue('device', device.deviceId),
        }));

    return [...shared, ...deviceOptions];
  }, [devicesLoading, personalDevices, showTargetPicker, supportsSandbox, t]);

  const selectedTarget = resolveExecutionTargetSelection({
    boundDeviceId: effectiveAgencyConfig?.boundDeviceId,
    configuredTarget: effectiveAgencyConfig?.executionTarget,
    devices: personalDevices,
    isHeterogeneous: true,
  });
  const selectedTargetValue = selectedTarget
    ? executionTargetValue(selectedTarget.target, selectedTarget.deviceId)
    : undefined;

  const handleTargetChange = (value: string) => {
    const selection = parseExecutionTargetValue(value);
    if (!selection) return;

    void updateAgentConfigById(agentId, {
      agencyConfig: {
        ...(selection.target === 'device'
          ? { boundDeviceId: selection.deviceId }
          : selection.target === 'local' && currentDeviceId
            ? { boundDeviceId: currentDeviceId }
            : {}),
        executionTarget: selection.target,
      },
    });
  };

  const handleModelChange = (value: string) => {
    if (!capability?.model) return;
    const selection = resolveModelSwitchSelection({
      capability: { ...capability, model: capability.model },
      effort,
      isFastSpeed: speed === 'fast',
      value,
    });
    void patchProvider(applyEngineAwareSelection(provider, selection));
  };

  const rows: { content: ReactNode; key: string; label: string }[] = [
    {
      content: legacyRuntime ? (
        <Flexbox align={'flex-start'} gap={8}>
          <Text>{t('agentEngine.legacy.name')}</Text>
          <Text className={styles.hint}>{t('agentEngine.legacy.description')}</Text>
          <Button
            disabled={!canEdit}
            size={'small'}
            type={'primary'}
            onClick={() => {
              void patchProvider({ engine: DEFAULT_ORVILO_ENGINE, type: 'orvilo' });
            }}
          >
            {t('agentEngine.legacy.migrate')}
          </Button>
        </Flexbox>
      ) : (
        <Select
          className={styles.select}
          disabled={!canEdit}
          options={harnessOptions}
          value={harnessType}
          onChange={(value) => {
            if (typeof value !== 'string') return;
            void patchProvider(
              buildHarnessProviderPatch(provider, value as HeterogeneousAgentType),
            );
          }}
        />
      ),
      key: 'harness',
      label: t('agentEngine.harness.label'),
    },
  ];

  if (builtinEngine) {
    rows.push({
      content: (
        <>
          <Select
            className={styles.select}
            disabled={!canEdit}
            options={engineOptions}
            value={provider?.engine ?? DEFAULT_ORVILO_ENGINE}
            onChange={(value) => {
              if (typeof value !== 'string') return;
              void patchProvider(buildEngineProviderPatch(provider, value as OrviloEngineKind));
            }}
          />
          {engineCapabilities &&
          (!engineCapabilities.userQuestions || !engineCapabilities.builtinTools) ? (
            <Text className={styles.hint} type={'warning'}>
              {t('agentEngine.engine.limitedCapabilities')}
            </Text>
          ) : null}
        </>
      ),
      key: 'engine',
      label: t('agentEngine.engine.label'),
    });
  }

  if (capability?.model?.source === 'static') {
    rows.push({
      content: (
        <Select
          className={styles.select}
          disabled={!canEdit}
          options={modelOptions}
          showSearch={false}
          value={model}
          onChange={(value) => {
            if (typeof value === 'string') handleModelChange(value);
          }}
        />
      ),
      key: 'model',
      label: t('agentEngine.model.label'),
    });
  } else if (isCatalogModel) {
    rows.push({
      content: (
        <>
          <Select
            showSearch
            className={styles.select}
            disabled={!canEdit}
            loading={catalog.isLoading}
            options={catalogModelOptions}
            value={model}
            onOpenChange={setCatalogOpen}
            onChange={(value) => {
              if (typeof value === 'string') handleModelChange(value);
            }}
          />
          {!catalogTargetReady ? (
            <Text className={styles.hint}>{t('agentEngine.model.catalogPending')}</Text>
          ) : catalog.error ? (
            <Text className={styles.hint}>{t('agentEngine.model.catalogError')}</Text>
          ) : null}
        </>
      ),
      key: 'model',
      label: t('agentEngine.model.label'),
    });
  }

  if (capability?.effort && effort !== undefined) {
    rows.push({
      content: (
        <Select
          className={styles.select}
          disabled={!canEdit}
          options={effortOptions}
          value={effort}
          onChange={(value) => {
            if (typeof value !== 'string') return;
            void patchProvider(
              applyEngineAwareSelection(provider, {
                effort: value as HeterogeneousReasoningEffort,
              }),
            );
          }}
        />
      ),
      key: 'effort',
      label: t('agentEngine.effort.label'),
    });
  }

  if (capability?.mode && mode !== undefined) {
    rows.push({
      content: (
        <Select
          className={styles.select}
          disabled={!canEdit}
          options={modeOptions}
          value={mode}
          onChange={(value) => {
            if (typeof value !== 'string') return;
            void patchProvider(
              applyEngineAwareSelection(provider, {
                mode: value as HeterogeneousAgentMode,
              }),
            );
          }}
        />
      ),
      key: 'mode',
      label: t('agentEngine.mode.label'),
    });
  }

  if (speedSupported) {
    rows.push({
      content: (
        <Select
          className={styles.select}
          disabled={!canEdit}
          options={speedOptions}
          value={speed}
          onChange={(value) => {
            if (typeof value !== 'string') return;
            void patchProvider(
              applyEngineAwareSelection(provider, {
                speed: value as HeterogeneousSpeedMode,
              }),
            );
          }}
        />
      ),
      key: 'speed',
      label: t('agentEngine.speed.label'),
    });
  }

  if (showTargetPicker) {
    rows.push({
      content: (
        <>
          <Select
            className={styles.select}
            disabled={!canEdit}
            options={targetOptions}
            placeholder={t('settingAgent.devicePolicy.selectTarget')}
            value={selectedTargetValue}
            onChange={(value) => {
              if (typeof value === 'string') handleTargetChange(value);
            }}
          />
          {builtinEngine ? (
            <Text className={styles.hint}>{t('agentEngine.target.orviloHint')}</Text>
          ) : null}
        </>
      ),
      key: 'target',
      label: t('agentEngine.target.label'),
    });
  }

  return (
    <Flexbox className={styles.card} gap={0}>
      <div className={styles.cardHeader}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Icon icon={Cpu} size={16} />
          <Text strong className={styles.title}>
            {t('agentEngine.title')}
          </Text>
        </Flexbox>
      </div>
      <div className={styles.detailList}>
        {rows.map((row) => (
          <div className={styles.detailRow} key={row.key}>
            <Text className={styles.detailLabel}>{row.label}</Text>
            <div className={styles.detailContent}>{row.content}</div>
          </div>
        ))}
      </div>
    </Flexbox>
  );
});

EngineConfigCard.displayName = 'EngineConfigCard';

export default EngineConfigCard;
