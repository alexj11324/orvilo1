'use client';

import { Markdown } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { agentDisplayName } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import { AgentNotFound } from '@/features/AgentNotFound';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const Body = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useChatStore(chatPortalSelectors.agentDetailId) || '';
  const useFetchAgentConfig = useAgentStore((s) => s.useFetchAgentConfig);
  const { error, isLoading, mutate } = useFetchAgentConfig(true, agentId);
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const openingMessage = useAgentStore(
    (s) => agentSelectors.getAgentConfigById(agentId)(s)?.openingMessage,
  );
  const isNotFound = useAgentStore(agentByIdSelectors.isAgentNotFoundById(agentId));
  const displayName = agentDisplayName(meta, t('defaultSession', { ns: 'common' }));

  if (!agentId) return null;

  // The fetch settled on `null` — the agent was deleted or made private by
  // its owner. A terminal 404, distinct from the retryable transport error.
  if (isNotFound) {
    return (
      <div className="flex flex-col flex-1" style={{ overflowY: 'auto' }}>
        <AgentNotFound />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 p-6">
        <AsyncError error={error} variant="page" onRetry={() => void mutate()} />
      </div>
    );
  }

  if (isLoading) return <SurfaceSkeleton header={false} variant={'form'} />;

  return (
    <div className="flex flex-col items-center flex-1 gap-4 p-8" style={{ overflowY: 'auto' }}>
      <Avatar
        avatar={meta.avatar}
        background={meta.backgroundColor}
        name={displayName}
        shape="square"
        size={80}
      />
      <Text align="center" fontSize={24} weight="bold">
        {displayName}
      </Text>
      {meta.description && (
        <Text align="center" type="secondary">
          {meta.description}
        </Text>
      )}
      {openingMessage && (
        <div className="flex flex-col" style={{ width: 'min(100%, 560px)' }}>
          <Markdown variant="chat">{openingMessage}</Markdown>
        </div>
      )}
    </div>
  );
});

export default Body;
