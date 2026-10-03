'use client';

import { isDesktop } from '@orvilo/const';
import type {
  HeterogeneousAgentMode,
  HeterogeneousProviderConfig,
  HeterogeneousReasoningEffort,
  HeterogeneousSpeedMode,
  ListHeterogeneousAgentModelsParams,
} from '@orvilo/types';
import {
  applyHeteroSelection,
  getHeteroSelectorCapability,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  normalizeHeterogeneousProviderConfig,
} from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { Brain } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PartialDeep } from 'type-fest';

import type { SelectOptions } from '@/components/SelectOptions';
import { flattenSelectOptions, selectItems, SelectOptionItems } from '@/components/SelectOptions';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getEffortLabelKeys,
  getModeLabelKey,
} from '@/features/ChatInput/ControlBar/HeteroModel/labels';
import { getStaticModelOptions } from '@/features/ChatInput/ControlBar/HeteroModel/modelOptions';
import { resolveModelSwitchSelection } from '@/features/ChatInput/ControlBar/HeteroModel/selectorView';
import { useModelCatalog } from '@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentModelSettingsProps {
  agentId: string;
}

/**
 * The agent's Model settings group. Builtin Orvilo agents pick the model
 * route of an enabled embedded-eligible provider binding (the same narrowing
 * `resolveOrviloProviderBinding` applies at dispatch); external harnesses get
 * their capability-driven model/effort/mode/speed rows — each row renders
 * only when the model + adapter actually support it at runtime (the
 * capability contract), per docs/development/device-execution-contract.md.
 */
const AgentModelSettings = memo<AgentModelSettingsProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'chat']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const rawProvider = config?.agencyConfig?.heterogeneousProvider;
  const provider = rawProvider ? normalizeHeterogeneousProviderConfig(rawProvider) : undefined;
  const {
    agencyConfig: effectiveAgencyConfig,
    isPreferenceLoading,
    workspaceScoped,
  } = useEffectiveAgencyConfig(agentId);
  const { isLoading: devicesLoading } = useDeviceList();
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const cwd = useEffectiveWorkingDirectory(agentId);

  // A missing provider is a legacy chat runtime — model config lives on the
  // legacy `model`/`provider` fields which this group does not surface (the
  // General group offers the one-click migrate instead).
  const legacyRuntime = !provider;
  const harnessType = provider?.type ?? 'orvilo';
  const builtinEngine = !legacyRuntime && isBuiltinEngineType(harnessType);
  const capability =
    legacyRuntime || builtinEngine ? undefined : getHeteroSelectorCapability(harnessType);

  const patchProvider = (patch: PartialDeep<HeterogeneousProviderConfig>) => {
    const nextType = patch.type ?? provider?.type ?? 'orvilo';
    const base: PartialDeep<HeterogeneousProviderConfig> = provider ? {} : { type: nextType };
    return updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...base, ...patch } },
    });
  };

  // Prime's model contract: an embedded run's model is the `modelRoute` of
  // the provider binding it issues, so the picker lists the routes of the
  // user's enabled embedded-eligible bindings (runtime 'orvilo' + target
  // 'sandbox') — the same rows `resolveOrviloProviderBinding` may resolve.
  const bindings = useProviderBindingStore((s) => s.bindings);
  useFetchProviderBindings();

  const primeModelOptions = useMemo<SelectOptions>(() => {
    if (!builtinEngine) return [];
    const routes = new Set<string>();
    for (const binding of bindings) {
      const selection = binding.selection;
      if (
        binding.enabled === true &&
        selection?.runtime === 'orvilo' &&
        selection.target === 'sandbox' &&
        binding.model
      ) {
        routes.add(binding.model);
      }
    }
    return [...routes].map((route) => ({ label: route, title: route, value: route }));
  }, [bindings, builtinEngine]);

  const model =
    capability?.model?.resolve(provider) ??
    (builtinEngine ? (provider?.model ?? '') : HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  const effort = capability?.effort?.resolve(provider);
  const mode = capability?.mode?.resolve(provider);
  const speedSupported = capability?.speed?.supported(model) ?? false;
  const speed: HeterogeneousSpeedMode = speedSupported
    ? capability!.speed!.resolve(provider)
    : HETEROGENEOUS_AGENT_DEFAULT_SELECTION;

  const effortLabelKeys = getEffortLabelKeys(harnessType);
  const defaultLabel = t('chat:heteroAgent.modelSelector.default');

  const modelOptions = useMemo<SelectOptions>(() => {
    if (capability?.model?.source !== 'static') return [];

    const base: SelectOptions = [
      { label: defaultLabel, value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION },
      ...getStaticModelOptions(harnessType),
    ];

    return model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !base.some((option) => 'value' in option && option.value === model)
      ? [{ label: model, title: model, value: model }, ...base]
      : base;
  }, [capability?.model?.source, defaultLabel, model, harnessType]);

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

  const handleModelChange = (value: string) => {
    if (!capability?.model) return;
    const selection = resolveModelSwitchSelection({
      capability: { ...capability, model: capability.model },
      effort,
      isFastSpeed: speed === 'fast',
      value,
    });
    void patchProvider(applyHeteroSelection(provider, selection));
  };

  const showModelRow = builtinEngine || capability?.model?.source === 'static' || isCatalogModel;

  if (!provider || (!showModelRow && !capability?.effort && !capability?.mode && !speedSupported)) {
    return null;
  }

  return (
    <SettingsGroup icon={Brain} title={t('agentEngine.model.groupTitle')}>
      {builtinEngine ? (
        <SettingsRow label={t('agentEngine.model.label')}>
          {primeModelOptions.length > 0 ? (
            <Select
              disabled={!canEdit}
              items={selectItems(primeModelOptions)}
              value={model || undefined}
              onValueChange={(value) => {
                if (typeof value !== 'string') return;
                void patchProvider({ model: value });
              }}
            >
              <SelectTrigger className={settingsStyles.select}>
                <SelectValue placeholder={t('agentEngine.model.label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectOptionItems options={primeModelOptions} />
              </SelectContent>
            </Select>
          ) : (
            <div className={settingsStyles.hint}>{t('agentEngine.model.noPrimeBinding')}</div>
          )}
          {primeModelOptions.length > 0 ? (
            <div className={settingsStyles.hint}>{t('agentEngine.model.primeHint')}</div>
          ) : null}
        </SettingsRow>
      ) : null}

      {capability?.model?.source === 'static' ? (
        <SettingsRow label={t('agentEngine.model.label')}>
          <Select
            disabled={!canEdit}
            items={selectItems(modelOptions)}
            value={model}
            onValueChange={(value) => {
              if (typeof value === 'string') handleModelChange(value);
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={modelOptions} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}

      {isCatalogModel ? (
        <SettingsRow label={t('agentEngine.model.label')}>
          <Combobox
            disabled={!canEdit || catalog.isLoading}
            items={flattenSelectOptions(catalogModelOptions).map((o) => o.value)}
            value={model}
            itemToStringLabel={(v) =>
              flattenSelectOptions(catalogModelOptions).find((o) => o.value === v)?.title ?? v
            }
            onOpenChange={(open) => setCatalogOpen(open)}
            onValueChange={(value) => {
              if (typeof value === 'string') handleModelChange(value);
            }}
          >
            <ComboboxInput className={settingsStyles.select} />
            <ComboboxContent>
              <ComboboxEmpty>
                {catalog.isLoading ? t('agentEngine.model.catalogPending') : null}
              </ComboboxEmpty>
              <ComboboxList>
                {(v) => {
                  const option = flattenSelectOptions(catalogModelOptions).find(
                    (o) => o.value === v,
                  );
                  return (
                    <ComboboxItem key={v} value={v}>
                      {option?.label ?? v}
                    </ComboboxItem>
                  );
                }}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {!catalogTargetReady ? (
            <div className={settingsStyles.hint}>{t('agentEngine.model.catalogPending')}</div>
          ) : catalog.error ? (
            <div className={settingsStyles.hint}>{t('agentEngine.model.catalogError')}</div>
          ) : null}
        </SettingsRow>
      ) : null}

      {capability?.effort && effort !== undefined ? (
        <SettingsRow label={t('agentEngine.effort.label')}>
          <Select
            disabled={!canEdit}
            items={selectItems(effortOptions)}
            value={effort}
            onValueChange={(value) => {
              if (typeof value !== 'string') return;
              void patchProvider(
                applyHeteroSelection(provider, {
                  effort: value as HeterogeneousReasoningEffort,
                }),
              );
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={effortOptions} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}

      {capability?.mode && mode !== undefined ? (
        <SettingsRow label={t('agentEngine.mode.label')}>
          <Select
            disabled={!canEdit}
            items={selectItems(modeOptions)}
            value={mode}
            onValueChange={(value) => {
              if (typeof value !== 'string') return;
              void patchProvider(
                applyHeteroSelection(provider, {
                  mode: value as HeterogeneousAgentMode,
                }),
              );
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={modeOptions} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}

      {speedSupported ? (
        <SettingsRow label={t('agentEngine.speed.label')}>
          <Select
            disabled={!canEdit}
            items={selectItems(speedOptions)}
            value={speed}
            onValueChange={(value) => {
              if (typeof value !== 'string') return;
              void patchProvider(
                applyHeteroSelection(provider, {
                  speed: value as HeterogeneousSpeedMode,
                }),
              );
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={speedOptions} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
});

AgentModelSettings.displayName = 'AgentModelSettings';

export default AgentModelSettings;
