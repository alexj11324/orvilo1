'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { StyleSheet } from '@/utils/styles';

import PermissionForm from './PermissionForm';

const styles = StyleSheet.create({
  body: {
    display: 'flex',
    overflowY: 'auto',
    position: 'relative',
  },
});

const AgentPermission = memo(() => {
  const { t } = useTranslation('setting');
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  // Data-presence loading ("no config in the map yet") is true on failure too,
  // so read the recorded fetch error as well — otherwise a failed config load
  // renders the personal-agent empty state, which is a different fact.
  const isAgentConfigLoading = useAgentStore(agentSelectors.isAgentConfigLoading);
  const configError = useAgentStore(agentSelectors.currentAgentConfigError);
  const retryAgentConfigFetch = useAgentStore((s) => s.retryAgentConfigFetch);

  return (
    <div className="flex flex-col h-full w-full">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          activeAgentId ? (
            <AgentBreadcrumb agentId={activeAgentId} title={t('permission.page.title')} />
          ) : null
        }
      />
      <div className="flex flex-col flex-1 w-full" style={{ ...styles.body }}>
        <WideScreenContainer>
          <div className="flex flex-col gap-4" style={{ paddingBlock: 16 }}>
            <AsyncBoundary
              data={isAgentConfigLoading ? undefined : true}
              error={configError}
              errorVariant={'page'}
              isLoading={isAgentConfigLoading && !configError}
              loading={<SurfaceSkeleton header={false} variant={'form'} />}
              onRetry={() => retryAgentConfigFetch()}
            >
              <PermissionForm agentId={activeAgentId ?? ''} />
            </AsyncBoundary>
          </div>
        </WideScreenContainer>
      </div>
    </div>
  );
});

AgentPermission.displayName = 'AgentPermission';

export default AgentPermission;
