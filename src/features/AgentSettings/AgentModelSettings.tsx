'use client';

import { isDesktop } from '@orvilo/const';
import type {
  HeterogeneousProviderConfig,
  ListHeterogeneousAgentModelsParams,
} from '@orvilo/types';
import {
  applyHeteroSelection,
  getCliConfigValue,
  getCliFlagValue,
  getHeteroSelectorCapability,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  HETEROGENEOUS_MODEL_INHERIT_SELECTION,
  isSelectableDevice,
  normalizeHeterogeneousProviderConfig,
} from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { TriangleAlertIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PartialDeep } from 'type-fest';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import type { SelectOptions } from '@/components/SelectOptions';
import { flattenSelectOptions } from '@/components/SelectOptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useModelCatalog } from '@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog';
import { AgentModelPicker } from '@/features/CreateAgent/AgentModelPicker';
import { useAgentDeviceCandidates, useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { buildServerDefaultModelOptions } from '@/features/HeterogeneousAgent/modelPicker';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import {
  resolveAgentWorkingDirectory,
  resolveTargetDeviceId,
} from '@/helpers/agentWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useAiInfraStore } from '@/store/aiInfra';
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
 * model catalog directly from the runtime on their execution device.
 */
const AgentModelSettings = memo<AgentModelSettingsProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'chat', 'common']);
  const navigate = useWorkspaceAwareNavigate();
  const { status, save, lastSavedAt, retry } = useSaveState();
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
  const { data: devices, isLoading: devicesLoading } = useDeviceList();
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const configuredCwd = useEffectiveWorkingDirectory(agentId, { topicId: null });
  const legacyAgentWorkingDirectory = useAgentStore(
    (s) => s.localAgentWorkingDirectoryMap[agentId],
  );

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
    return save(() =>
      updateAgentConfigById(
        agentId,
        {
          agencyConfig: { heterogeneousProvider: { ...base, ...patch } },
        },
        { rethrow: true },
      ),
    );
  };

  // Prime's model contract: an embedded run's model is the `modelRoute` of
  // the provider binding it issues, so the picker lists the routes of the
  // user's enabled embedded-eligible bindings (runtime 'orvilo' + target
  // 'sandbox') — the same rows `resolveOrviloProviderBinding` may resolve.
  const bindings = useProviderBindingStore((s) => s.bindings);
  const bindingQuery = useFetchProviderBindings(builtinEngine);
  const builtinAiModelList = useAiInfraStore((s) => s.builtinAiModelList);

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
    // Human-readable model labels via the model-bank catalog (displayName);
    // the raw binding route stays in the option value + ModelItemRender's id.
    return buildServerDefaultModelOptions(
      [...routes].map((model) => ({ model })),
      builtinAiModelList,
    );
  }, [bindings, builtinEngine, builtinAiModelList]);

  const model =
    capability?.model?.resolve(provider) ??
    (builtinEngine ? (provider?.model ?? '') : HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  const defaultLabel = t('chat:heteroAgent.modelSelector.default');

  // Catalog-backed CLIs enumerate models on the machine the run targets, so
  // the picker only fills once the effective target resolves somewhere real.
  const effectiveTarget = resolveExecutionTarget(effectiveAgencyConfig, {
    clientExecutionAvailable: isDesktop,
    isHetero: true,
    workspaceScoped,
  });
  const targetDeviceId = resolveTargetDeviceId(effectiveAgencyConfig, currentDeviceId, {
    workspaceScoped,
  });
  const isCatalogModel = capability?.model?.source === 'catalog';
  const canAutoResolveCatalog =
    isCatalogModel &&
    !workspaceScoped &&
    !effectiveAgencyConfig?.boundDeviceId &&
    effectiveAgencyConfig?.executionTargetSelectionPolicy !== 'fixed' &&
    (effectiveAgencyConfig?.executionTarget === undefined ||
      effectiveAgencyConfig.executionTarget === 'auto');
  const candidateQuery = useAgentDeviceCandidates(
    canAutoResolveCatalog && !isPreferenceLoading ? agentId : undefined,
  );
  const candidates = candidateQuery.data?.candidates.filter(isSelectableDevice) ?? [];
  const singletonId =
    canAutoResolveCatalog && candidateQuery.data?.inventoryComplete && candidates.length === 1
      ? candidates[0].deviceId
      : undefined;
  const useLocalIpc =
    isDesktop &&
    (effectiveTarget === 'local' || (!!singletonId && singletonId === currentDeviceId));
  const catalogDeviceId = useLocalIpc ? undefined : (singletonId ?? targetDeviceId);
  const catalogTargetReady =
    isCatalogModel &&
    (useLocalIpc || ((effectiveTarget === 'device' || !!singletonId) && !!catalogDeviceId));
  const cwd = singletonId
    ? resolveAgentWorkingDirectory({
        agencyConfig: {
          ...effectiveAgencyConfig,
          executionTarget: 'device',
          boundDeviceId: singletonId,
        },
        legacyAgentWorkingDirectory,
        fallback: singletonId === currentDeviceId ? configuredCwd : undefined,
        deviceDefaultCwd:
          devices?.find((device) => device.deviceId === singletonId)?.defaultCwd ?? undefined,
        workspaceScoped,
      })
    : configuredCwd;
  const catalog = useModelCatalog({
    cwd,
    deviceId: catalogDeviceId,
    isDeviceListLoading: devicesLoading,
    isPreferenceLoading,
    open: true,
    provider: isCatalogModel ? provider : undefined,
    targetReady: catalogTargetReady,
    type: harnessType as ListHeterogeneousAgentModelsParams['type'],
  });

  const catalogError = catalog.error ?? (canAutoResolveCatalog ? candidateQuery.error : undefined);
  const retryCatalog = async () => {
    if (canAutoResolveCatalog) await candidateQuery.mutate();
    await catalog.mutate();
  };

  const catalogModelOptions = useMemo(() => {
    if (!isCatalogModel) return [];
    const models = catalog.data?.models ?? [];
    const staleCurrent =
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION && !models.some((item) => item.id === model);

    return [
      { label: defaultLabel, value: HETEROGENEOUS_MODEL_INHERIT_SELECTION },
      ...(staleCurrent ? [{ label: model, value: model }] : []),
      ...models.map((item) => ({
        label: item.label || item.id,
        value: item.id,
        ...(item.label && item.label !== item.id ? { description: item.id } : {}),
      })),
    ];
  }, [catalog.data?.models, defaultLabel, isCatalogModel, model]);

  const handleModelChange = (value: string) => {
    if (!capability?.model) return;
    void patchProvider(
      applyHeteroSelection(provider, {
        model: value,
        modelExplicit: value !== HETEROGENEOUS_MODEL_INHERIT_SELECTION,
      }),
    );
  };

  const showModelRow = builtinEngine || isCatalogModel;

  if (!provider || !showModelRow) {
    return null;
  }

  return (
    <SettingsGroup
      title={t('settingAgent.modelSettings.title')}
      action={
        status !== 'idle' ? (
          <AutoSaveHint
            lastUpdatedTime={lastSavedAt}
            saveStatus={status}
            onRetry={() => void retry()}
          />
        ) : undefined
      }
    >
      {builtinEngine ? (
        <AsyncBoundary
          data={bindingQuery.data}
          error={bindingQuery.error}
          isLoading={bindingQuery.isLoading}
          onRetry={() => void bindingQuery.mutate()}
        >
          {primeModelOptions.length > 0 ? (
            <SettingsRow label={t('settingAgent.modelSettings.modelLabel')}>
              <AgentModelPicker
                disabled={!canEdit || status === 'saving'}
                value={model}
                options={flattenSelectOptions(primeModelOptions).map((option) => ({
                  value: String(option.value),
                  label: option.title ?? String(option.value),
                }))}
                onChange={(value) => void patchProvider({ model: value })}
              />
              <div className={settingsStyles.hint}>{t('settingAgent.modelSettings.primeHint')}</div>
            </SettingsRow>
          ) : (
            <SettingsRow>
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>{t('settingAgent.modelSettings.noBindingTitle')}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col items-start gap-2">
                    <span>{t('settingAgent.modelSettings.noBindingDesc')}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/settings/provider')}
                    >
                      {t('settingAgent.modelSettings.bindAction')}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </SettingsRow>
          )}
        </AsyncBoundary>
      ) : null}

      {isCatalogModel ? (
        <SettingsRow label={t('settingAgent.modelSettings.modelLabel')}>
          <AgentModelPicker
            disabled={!canEdit || status === 'saving'}
            error={catalogError}
            loading={catalog.isLoading || (canAutoResolveCatalog && candidateQuery.isLoading)}
            options={catalogModelOptions}
            value={
              model === HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
              getCliFlagValue(provider.args, '--model') !== 'default' &&
              getCliFlagValue(provider.args, '-m') !== 'default' &&
              getCliConfigValue(provider.args, 'model') !== 'default'
                ? HETEROGENEOUS_MODEL_INHERIT_SELECTION
                : model
            }
            onChange={handleModelChange}
            onRetry={() => void retryCatalog()}
          />
          {catalogError ? (
            <AsyncError
              error={catalogError}
              title={t('settingAgent.modelSettings.catalogError')}
              variant="inline"
              onRetry={() => void retryCatalog()}
            />
          ) : !catalogTargetReady ? (
            <div className={settingsStyles.hint}>
              {t('settingAgent.modelSettings.catalogPending')}
            </div>
          ) : !catalog.isLoading && catalog.data?.models.length === 0 ? (
            <div className={settingsStyles.hint}>
              {t('settingAgent.modelSettings.catalogEmpty')}
            </div>
          ) : null}
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
});

AgentModelSettings.displayName = 'AgentModelSettings';

export default AgentModelSettings;
