'use client';

import { agentDisplayName } from '@orvilo/types';
import { Loader2 } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { resolveInboxAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';

import { usePreservedAgentUrl } from './usePreservedAgentUrl';

const styles = {
  runningBadge:
    'pointer-events-none absolute -inset-be-1 -end-1 inline-flex size-5 items-center justify-center rounded-full border-[length:calc(var(--spacing)*0.375)] border-card bg-card text-warning-text',
  wrapper: 'relative inline-flex',
};

interface InboxItemProps {
  className?: string;
  style?: CSSProperties;
}

const InboxItem = memo<InboxItemProps>(({ className, style }) => {
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const inboxRouteAgentId = resolveInboxAgentRouteId(inboxAgentId);
  const inboxMeta = useAgentStore(agentSelectors.getAgentMetaById(inboxRouteAgentId));

  const isLoading = useChatStore(
    inboxAgentId ? operationSelectors.isAgentVisiblyRunning(inboxAgentId) : () => false,
  );
  const prefetchAgent = usePrefetchAgent();
  const inboxAgentTitle = agentDisplayName(inboxMeta, 'Orvilo AI');
  const inboxUrl = usePreservedAgentUrl(inboxRouteAgentId);

  // Prefetch agent layout chunk and data eagerly since Orvilo AI is almost always clicked
  if (inboxAgentId) prefetchAgent(inboxAgentId);

  const avatarNode = <AgentRuntimeIcon size={24} type="orvilo" />;

  return (
    <WorkspaceLink aria-label={inboxAgentTitle} to={inboxUrl}>
      <NavItem
        className={className}
        style={style}
        title={inboxAgentTitle}
        icon={
          isLoading ? (
            <span className={styles.wrapper}>
              {avatarNode}
              <span className={styles.runningBadge}>
                <Loader2 className="animate-spin" size={14} />
              </span>
            </span>
          ) : (
            avatarNode
          )
        }
      />
    </WorkspaceLink>
  );
});

export default InboxItem;
