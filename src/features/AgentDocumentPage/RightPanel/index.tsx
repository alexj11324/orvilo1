'use client';

import { agentDisplayName } from '@orvilo/types';
import { ChevronLeftIcon } from 'lucide-react';
import { memo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { isDesktop } from '@/const/version';
import AgentDocumentsGroup from '@/features/Conversation/WorkingSidebar/ResourcesSection/AgentDocumentsGroup';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useIsGatewayModeEnabled } from '@/helpers/gatewayMode';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, agentSelectors } from '@/store/agent/selectors';

const styles = {
  backLink:
    'flex min-h-8 w-fit items-center gap-0.5 rounded-(--radius-button) bg-transparent py-0.75 ps-1 pe-1.5 text-sm leading-5.5 text-foreground-tertiary no-underline transition-[color,background-color] duration-(--orvilo-motion-fast) ease-[ease] hover:bg-accent hover:text-muted-foreground motion-reduce:transition-none',
  body: 'h-full overflow-y-auto',
};

const AgentDocumentSidebarContent = memo(() => {
  const { t } = useTranslation('chat');
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const { aid: agentId = '' } = useActiveRouteParams<{
    aid?: string;
  }>();
  const agentMeta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const agentTitle = agentDisplayName(agentMeta, t('untitledAgent'));
  const agentPath = buildWorkspaceAwarePath(`/agent/${agentId}`, activeWorkspaceSlug);
  const isHetero = useAgentStore(agentByIdSelectors.isAgentHeterogeneousById(agentId));
  const workingDirectory = useEffectiveWorkingDirectory(agentId);
  const agencyConfig = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgencyConfigById(agentId)(s) : undefined,
  );
  const deviceRoutingAvailable = useIsGatewayModeEnabled(agentId);
  const isWorkspaceAgent = useAgentStore((s) =>
    agentId ? agentByIdSelectors.isWorkspaceAgentById(agentId)(s) : false,
  );
  const effectiveTarget = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: isDesktop,
    deviceRoutingAvailable,
    isHetero,
    workspaceScoped: isWorkspaceAgent,
  });
  const remoteDeviceId =
    effectiveTarget === 'device' && agencyConfig?.boundDeviceId
      ? agencyConfig.boundDeviceId
      : undefined;

  const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;

    event.preventDefault();
    appNavigate(agentPath, { escape: true });
  };

  const header = (
    <div className="flex flex-none items-center justify-between px-1.5 py-2">
      <a
        className={styles.backLink}
        data-slot="agent-document-back-link"
        href={agentPath}
        onClick={handleBack}
      >
        <ChevronLeftIcon size={16} />
        {t('agentDocument.backToAgent', { name: agentTitle })}
      </a>
    </div>
  );

  const body = (
    <div className={`flex flex-col w-full ${styles.body}`}>
      <AgentDocumentsGroup
        activeFilter="documents"
        deviceId={remoteDeviceId}
        openMode="route"
        showFilterTabs={false}
        showLocalProjectSkills={false}
        style={{ flex: 1, minHeight: 0 }}
        workingDirectory={workingDirectory}
      />
    </div>
  );

  return <SideBarLayout body={body} header={header} />;
});

AgentDocumentSidebarContent.displayName = 'AgentDocumentSidebarContent';

export default AgentDocumentSidebarContent;
