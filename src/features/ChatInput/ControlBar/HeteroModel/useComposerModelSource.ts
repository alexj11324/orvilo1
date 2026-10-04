'use client';

import { getHeterogeneousTypeLabel } from '@orvilo/heterogeneous-agents';
import type {
  HeterogeneousProviderConfig,
  ListHeterogeneousAgentModelsParams,
  ProviderBinding,
} from '@orvilo/types';
import { getHeteroSelectorCapability } from '@orvilo/types';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { buildServerDefaultModelOptions } from '@/features/HeterogeneousAgent/modelPicker';
import type { SimpleModelSource } from '@/features/ModelSwitchPanel';
import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { useAiInfraStore } from '@/store/aiInfra';
import { useDeviceStore } from '@/store/device';
import { useElectronStore } from '@/store/electron';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { getStaticModelOptions } from './modelOptions';
import { COMPOSER_DEFAULT_MODEL_LABEL_KEY, withDefaultModelOption } from './resolveComposerModel';
import { useModelCatalog } from './useModelCatalog';

/** Catalog failure codes → user-facing copy (the mapping the old picker had). */
const CATALOG_ERROR_KEYS: Record<string, string> = {
  cli_not_found: 'heteroAgent.cliModel.cliNotFound',
  device_unavailable: 'heteroAgent.cliModel.targetUnavailable',
  timeout: 'heteroAgent.cliModel.timeout',
  unsupported_client: 'heteroAgent.cliModel.unsupportedClient',
};

/**
 * Routes of the enabled embedded-eligible provider bindings — the same narrowing
 * `resolveOrviloProviderBinding` applies at dispatch, and the same one Settings →
 * Agents uses (`AgentModelSettings.primeModelOptions`).
 */
export const collectPrimeModelRoutes = (bindings: readonly ProviderBinding[]): string[] => {
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
  return [...routes];
};

export interface ComposerModelSource {
  /** Feed `ModelSwitchPanel.onOpenChange` — it drives the catalog revalidate. */
  onOpenChange: (open: boolean) => void;
  /** `undefined` means the caller renders its read-only chip instead. */
  simpleSource?: SimpleModelSource;
}

/**
 * The composer's model list for a heterogeneous agent (spec §5.1). Every source
 * ends up as one flat list rendered by the shared `ModelSwitchPanel`:
 *
 * - builtin Orvilo (Prime) → the provider-binding routes;
 * - `static` CLI harnesses → the alias table;
 * - `catalog` CLI harnesses → the runtime probe (`useModelCatalog`);
 * - anything else → `undefined`, and the caller keeps its read-only chip.
 *
 * Nothing here writes the agent row (spec §5.2).
 */
export const useComposerModelSource = ({
  agentId,
  provider,
}: {
  agentId?: string;
  provider: HeterogeneousProviderConfig | undefined;
}): ComposerModelSource => {
  const { t } = useTranslation(['chat', 'setting']);
  const [open, setOpen] = useState(false);

  const type = provider?.type;
  const capability = getHeteroSelectorCapability(type);
  const source = capability?.model?.source;
  const isCatalog = source === 'catalog';
  const isPrime = isBuiltinEngineType(type);
  const isStatic = source === 'static';

  // Prime's list is the provider-binding route list (deduped SWR fetch).
  const bindings = useProviderBindingStore((s) => s.bindings);
  useFetchProviderBindings();
  const builtinAiModelList = useAiInfraStore((s) => s.builtinAiModelList);

  // A catalog probe needs the resolved execution target, exactly like the old
  // standalone picker did.
  const { agencyConfig, isPreferenceLoading, workspaceScoped } = useTopicAgencyConfig(agentId);
  const isLogin = useUserStore(authSelectors.isLogin);
  const { isLoading: isDeviceListLoading } = useDeviceStore((s) => s.useFetchDevices)(
    isLogin || heterogeneousAgentService.supportsLocalExecution,
  );
  const cwd = useEffectiveWorkingDirectory(agentId);
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const executionTarget = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: heterogeneousAgentService.supportsLocalExecution,
    isHetero: true,
    workspaceScoped,
  });
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId, { workspaceScoped });
  const useLocalIpc =
    heterogeneousAgentService.supportsLocalExecution && executionTarget === 'local';
  const rpcDeviceId = useLocalIpc ? undefined : targetDeviceId;
  const targetReady = useLocalIpc || (executionTarget === 'device' && !!rpcDeviceId);

  const catalog = useModelCatalog({
    cwd,
    deviceId: rpcDeviceId,
    enabled: isCatalog,
    isDeviceListLoading,
    isPreferenceLoading,
    open,
    provider,
    targetReady,
    type: type as ListHeterogeneousAgentModelsParams['type'],
  });

  const name = (type && getHeterogeneousTypeLabel(type)) || type || '';

  const simpleSource = useMemo<SimpleModelSource | undefined>(() => {
    if (isPrime && type) {
      const options = buildServerDefaultModelOptions(
        collectPrimeModelRoutes(bindings).map((route) => ({ model: route })),
        builtinAiModelList,
      ).map((option) => ({ title: option.title, value: String(option.value) }));

      return {
        emptyText: t('setting:settingAgent.modelSettings.noBindingTitle'),
        id: type,
        name,
        options,
      };
    }

    if (isStatic && type)
      return {
        id: type,
        name,
        options: withDefaultModelOption(
          getStaticModelOptions(type).map((option) => ({
            title: option.label,
            value: option.value,
          })),
          t(COMPOSER_DEFAULT_MODEL_LABEL_KEY),
        ),
      };

    if (isCatalog && type) {
      const models = catalog.data?.models ?? [];
      const errorName = (catalog.error as Error | undefined)?.name;

      return {
        emptyText: errorName
          ? t(CATALOG_ERROR_KEYS[errorName] ?? 'heteroAgent.cliModel.error', {
              defaultValue: t('heteroAgent.cliModel.error'),
            })
          : t('heteroAgent.cliModel.empty', { name }),
        id: type,
        name,
        options: withDefaultModelOption(
          models.map((model) => ({ title: model.label || model.id, value: model.id })),
          t(COMPOSER_DEFAULT_MODEL_LABEL_KEY),
        ),
      };
    }

    return undefined;
  }, [
    bindings,
    builtinAiModelList,
    catalog.data,
    catalog.error,
    isCatalog,
    isPrime,
    isStatic,
    name,
    t,
    type,
  ]);

  return { onOpenChange: setOpen, simpleSource };
};

/**
 * How the composer's model chip has to render for the current agent and lock
 * state. Kept as a pure function (and tested as one) so the decision is readable
 * without mounting the component — the repo does not add React component tests
 * for new features.
 *
 * - `hidden` — the caller may not even see the model.
 * - `locked` — `fixedByAgent` / `useOnly`: an inert chip with the reason
 *   tooltip, whatever the agent can otherwise do.
 * - `unsupported` — a harness with no model dimension (`kimi-code` / `amp`):
 *   the same inert chip, explained by its own tooltip, never an empty panel.
 * - `panel` — open the shared `ModelSwitchPanel`; a legacy agent without a
 *   heterogeneous provider simply arrives with no `simpleSource`.
 */
export type ComposerModelDispatch = 'hidden' | 'locked' | 'panel' | 'unsupported';

export const resolveComposerModelDispatch = ({
  canDisplayModel,
  canSelectModel,
  hasHeterogeneousProvider,
  hasModelDimension,
}: {
  canDisplayModel: boolean;
  canSelectModel: boolean;
  hasHeterogeneousProvider: boolean;
  hasModelDimension: boolean;
}): ComposerModelDispatch => {
  if (!canDisplayModel) return 'hidden';
  if (!canSelectModel) return 'locked';
  if (hasHeterogeneousProvider && !hasModelDimension) return 'unsupported';

  return 'panel';
};
