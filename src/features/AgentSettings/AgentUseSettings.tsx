'use client';

import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import {
  AddCollaboratorButton,
  CollaboratorList,
} from '@/features/ResourcePermission/Collaborators';
import { useResourcePermission } from '@/features/ResourcePermission/useResourcePermission';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { SettingsGroup } from './SettingsGroup';

/** Agent Use grants are member-specific; management remains a separate authority. */
export const AgentUseSettings = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation('setting');
  const isWorkspaceAgent = useAgentStore(agentByIdSelectors.isWorkspaceAgentById(agentId));
  const access = useResourcePermission('agent', isWorkspaceAgent ? agentId : undefined);
  if (!isWorkspaceAgent || (access.data && !access.data.canManage)) return null;

  return (
    <SettingsGroup title={t('settingAgent.useMembers.title')}>
      <AsyncBoundary
        data={access.data ? true : undefined}
        error={access.error}
        isLoading={access.isLoading}
        onRetry={() => void access.mutate()}
      >
        <p className="py-2 text-xs text-muted-foreground">{t('settingAgent.useMembers.hint')}</p>
        {access.data?.canManage ? (
          <>
            <CollaboratorList resourceId={agentId} resourceType="agent" />
            <div className="pt-2">
              <AddCollaboratorButton resourceId={agentId} resourceType="agent" />
            </div>
          </>
        ) : null}
      </AsyncBoundary>
    </SettingsGroup>
  );
};
