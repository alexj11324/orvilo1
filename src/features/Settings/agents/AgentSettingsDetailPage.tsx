'use client';

import { isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import isEqual from 'fast-deep-equal';
import { TriangleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import AgentAccessSettings from '@/features/AgentSettings/AgentAccessSettings';
import AgentAdvancedSettings from '@/features/AgentSettings/AgentAdvancedSettings';
import AgentDeviceSettings from '@/features/AgentSettings/AgentDeviceSettings';
import AgentGeneralSettings from '@/features/AgentSettings/AgentGeneralSettings';
import AgentModelSettings from '@/features/AgentSettings/AgentModelSettings';
import AgentRuntimeSettings from '@/features/AgentSettings/AgentRuntimeSettings';
import { AgentUseSettings } from '@/features/AgentSettings/AgentUseSettings';
import ExternalAgentConnectionSettings from '@/features/AgentSettings/ExternalAgentConnectionSettings';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import ResourceConfigAccessGate from '@/features/ResourcePermission/ResourceConfigAccessGate';
import SettingContainer from '@/features/Setting/SettingContainer';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import AgentSettingsHeader from './AgentSettingsHeader';

interface AgentSettingsDetailPageProps {
  agentId: string;
}

/**
 * Compatibility/migration notice for agents still on the legacy chat runtime
 * (no `heterogeneousProvider`) — the only place the migration CTA lives now.
 * Normal builtin agents never see it.
 */
const LegacyRuntimeNotice = memo<{ agentId: string }>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{t('settingAgent.generalSettings.legacyName')}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col items-start gap-2">
          <span>{t('settingAgent.generalSettings.legacyDesc')}</span>
          <Button
            disabled={!canEdit}
            size="sm"
            variant="outline"
            onClick={() => {
              void updateAgentConfigById(agentId, {
                agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
              });
            }}
          >
            {t('settingAgent.generalSettings.legacyMigrate')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
});

LegacyRuntimeNotice.displayName = 'AgentSettings.LegacyRuntimeNotice';

/**
 * `/settings/agents/:agentId` — a native settings page, not an embedded
 * profile. The compact header carries identity (the whole Tools/Skill/Run-
 * priority surface is gone: an agent's capabilities come from ACP mounts and
 * the symlink share, so nothing here manages them). Sections in IA order:
 * [Connection — external only] / Model & reasoning / Execution / Access /
 * Advanced. Legacy runtimes get the migration notice instead of rows.
 */
const AgentSettingsDetailPage = memo<AgentSettingsDetailPageProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const isHeterogeneous = useAgentStore(agentSelectors.isCurrentAgentHeterogeneous);
  const isAgentConfigLoading = useAgentStore(agentSelectors.isAgentConfigLoading);
  const configError = useAgentStore(agentSelectors.currentAgentConfigError);
  const retryAgentConfigFetch = useAgentStore((s) => s.retryAgentConfigFetch);

  const heterogeneousProvider = config?.agencyConfig?.heterogeneousProvider;
  const legacyRuntime = !heterogeneousProvider;
  const isRemoteHetero =
    isHeterogeneous &&
    !!heterogeneousProvider &&
    isRemoteHeterogeneousType(heterogeneousProvider.type);
  const externalAgent =
    isHeterogeneous && !!heterogeneousProvider && !isBuiltinEngineType(heterogeneousProvider.type);

  return (
    <ResourceConfigAccessGate
      loading={<SettingsSectionSkeleton />}
      redirectPath={'/settings/agents'}
      resourceId={agentId}
      resourceType={'agent'}
    >
      <SettingContainer paddingBlock={'24px 128px'} paddingInline={24} width="form">
        <AgentSettingsHeader agentId={agentId} />
        <AsyncBoundary
          data={isAgentConfigLoading ? undefined : true}
          error={configError}
          errorVariant={'page'}
          isLoading={isAgentConfigLoading && !configError}
          loading={<SettingsSectionSkeleton />}
          onRetry={() => retryAgentConfigFetch()}
        >
          {legacyRuntime ? (
            <div style={{ paddingBlockStart: 12 }}>
              <LegacyRuntimeNotice agentId={agentId} />
            </div>
          ) : null}
          <div className="flex flex-col" style={{ containerType: 'inline-size' }}>
            <AgentGeneralSettings agentId={agentId} />
            <AgentDeviceSettings agentId={agentId} />
            {/* Remote platforms carry no local model rows — model/effort is a
                local-CLI concept. */}
            {externalAgent && isRemoteHetero ? null : <AgentModelSettings agentId={agentId} />}
            <details className="mt-5 rounded-lg border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t('settingAgent.executionSettings.title')}
              </summary>
              <AgentRuntimeSettings agentId={agentId} />
              {externalAgent ? <ExternalAgentConnectionSettings agentId={agentId} /> : null}
            </details>
            <AgentAccessSettings agentId={agentId} />
            <AgentUseSettings agentId={agentId} />
            <AgentAdvancedSettings agentId={agentId} />
          </div>
        </AsyncBoundary>
      </SettingContainer>
    </ResourceConfigAccessGate>
  );
});

AgentSettingsDetailPage.displayName = 'AgentSettingsDetailPage';

export default AgentSettingsDetailPage;
