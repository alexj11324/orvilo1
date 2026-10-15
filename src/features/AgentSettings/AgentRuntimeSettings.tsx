'use client';

import type { HeterogeneousAgentPermissionCatalog, OrviloAgentAgencyConfig } from '@orvilo/types';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { PartialDeep } from 'type-fest';

import AsyncError from '@/components/AsyncError';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fingerprintConfig } from '@/features/ChatInput/ControlBar/HeteroModel/useModelCatalog';
import { useAgentManagementAccess } from '@/features/ResourcePermission/useAgentManagementAccess';
import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useSaveState } from '@/hooks/useSaveState';
import { getHostContext } from '@/platform';
import { heterogeneousAgentCatalogService } from '@/services/heterogeneousAgent';
import { useAgentStore } from '@/store/agent';
import { useElectronStore } from '@/store/electron';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

export const AgentRuntimeSettings = ({ agentId }: { agentId: string }) => {
  const desktop = getHostContext().kind === 'desktop';
  const { t } = useTranslation(['setting', 'chat']);
  const { canManageAgent: canEdit } = useAgentManagementAccess(agentId);
  const { agencyConfig, workspaceScoped, isPreferenceLoading } = useEffectiveAgencyConfig(agentId);
  const provider = agencyConfig?.heterogeneousProvider;
  const update = useAgentStore((s) => s.updateAgentConfigById);
  const updateRuntimeEnv = useAgentStore((s) => s.updateAgentRuntimeEnvConfigById);
  const workspaceId = useAgentStore((s) => s.agentMap[agentId]?.workspaceId);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const target = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: desktop,
    isHetero: !!provider,
    workspaceScoped,
  });
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId, { workspaceScoped });
  const cwd = useEffectiveWorkingDirectory(agentId, { homeFallback: false, topicId: null });
  const { save, retry, status, lastSavedAt } = useSaveState();
  const patch = (agencyPatch: PartialDeep<OrviloAgentAgencyConfig>) =>
    save(() => update(agentId, { agencyConfig: agencyPatch }, { rethrow: true }));
  const local = target === 'local' && desktop;
  const permissions = useSWR<HeterogeneousAgentPermissionCatalog[]>(
    !isPreferenceLoading &&
      provider &&
      provider.type !== 'orvilo' &&
      (local || (target === 'device' && targetDeviceId))
      ? [
          'heterogeneous-agent-permissions',
          provider.type,
          local ? 'local' : targetDeviceId,
          cwd ?? '',
          provider.command ?? '',
          fingerprintConfig(provider),
        ]
      : null,
    () =>
      heterogeneousAgentCatalogService.listPermissions({
        agentId,
        type: provider!.type,
        args: provider?.args,
        command: provider?.command,
        cwd,
        deviceId: local ? undefined : targetDeviceId,
        env: provider?.env,
      }),
    { dedupingInterval: 300_000, revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const hasRows =
    !!targetDeviceId || permissions.isLoading || !!permissions.error || !!permissions.data?.length;
  if (!hasRows) return null;

  return (
    <SettingsGroup title={t('settingAgent.executionSettings.title')}>
      {status !== 'idle' && (
        <AutoSaveHint
          lastUpdatedTime={lastSavedAt}
          saveStatus={status}
          onRetry={() => void retry()}
        />
      )}
      {targetDeviceId && (
        <SettingsRow label={t('settingAgent.execution.cwd')}>
          <Input
            aria-label={t('settingAgent.execution.cwd')}
            defaultValue={cwd ?? ''}
            disabled={!canEdit || status === 'saving'}
            key={`${targetDeviceId}:${cwd ?? ''}`}
            visualSize="normal"
            onBlur={(event) => {
              const path = event.target.value.trim();
              if (path === (cwd ?? '')) return;
              const personalDeviceTarget =
                workspaceId &&
                !workspaceScoped &&
                (agencyConfig?.executionTarget === 'local' || targetDeviceId === currentDeviceId);
              if (personalDeviceTarget)
                void save(() => updateRuntimeEnv(agentId, { workingDirectory: path || undefined }));
              else
                void patch({
                  workingDirByDevice: { [targetDeviceId]: path ? { path } : undefined },
                });
            }}
          />
        </SettingsRow>
      )}
      {permissions.error ? (
        <AsyncError
          error={permissions.error}
          variant="inline"
          onRetry={() => void permissions.mutate()}
        />
      ) : permissions.isLoading ? (
        <span className={settingsStyles.hint}>{t('chat:heteroAgent.permission.loading')}</span>
      ) : null}
      {permissions.data?.map((catalog) => (
        <SettingsRow key={catalog.configId} label={catalog.name}>
          <Select
            disabled={!canEdit || status === 'saving'}
            items={catalog.options.map((option) => ({ label: option.name, value: option.value }))}
            value={
              provider?.permission?.configId === catalog.configId
                ? provider.permission.value
                : catalog.currentValue
            }
            onValueChange={(value) => {
              if (typeof value === 'string')
                void patch({
                  heterogeneousProvider: {
                    type: provider!.type,
                    permission: { configId: catalog.configId, value },
                  },
                });
            }}
          >
            <SelectTrigger className={settingsStyles.select} size="normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span>{option.name}</span>
                  {option.description && (
                    <span className={settingsStyles.hint}>{option.description}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
};

export default AgentRuntimeSettings;
