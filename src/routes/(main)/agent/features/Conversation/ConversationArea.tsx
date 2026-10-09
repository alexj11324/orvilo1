'use client';

import { cssVar } from 'antd-style';
import debug from 'debug';
import { memo, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessConversationAnalytics } from '@/business/client/hooks/useBusinessConversationAnalytics';
import {
  TopicMigrationPlaceholder,
  useTopicMigrationPending,
} from '@/features/AgentTransferMigration';
import ChatbotPage from '@/features/AIChatbot/Page';
import { ConversationProvider } from '@/features/Conversation';
import ToolAuthAlert from '@/features/Conversation/AgentWelcome/ToolAuthAlert';
import { useMessageDeepLink } from '@/features/Conversation/ChatList/hooks/useMessageDeepLink';
import ComposerDraftReceiver from '@/features/Conversation/ComposerDraftReceiver';
import { useChatFollowUp } from '@/features/Conversation/hooks/useChatFollowUp';
import {
  ForwardMessageDispatcher,
  MessageForwardFooter,
} from '@/features/Conversation/MessageForward';
import { useAgentContext } from '@/features/Conversation/useAgentContext';
import { mergeConversationHooks } from '@/features/Conversation/utils/mergeConversationHooks';
import { useGatewayReconnect } from '@/hooks/useGatewayReconnect';
import { useOperationState } from '@/hooks/useOperationState';
import { useScheduledRunWatch } from '@/hooks/useScheduledRunWatch';
import { useAgentStore } from '@/store/agent';
import {
  agentByIdSelectors,
  builtinAgentSelectors,
  chatConfigByIdSelectors,
} from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { threadSelectors, topicSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ExposeMainEditor from './ExposeMainEditor';
import HeterogeneousChatInput from './HeterogeneousChatInput';
import { shouldShowInboxAgentResolving } from './InboxAgentLanding';
import MainChatInput from './MainChatInput';
import MessageFromUrl from './MainChatInput/MessageFromUrl';
import ThreadHydration from './ThreadHydration';
import { useActionsBarConfig } from './useActionsBarConfig';

const log = debug('orvilo-render:agent:ConversationArea');

/**
 * ConversationArea
 *
 * Main conversation area component using the new ConversationStore architecture.
 * Uses ChatList from @/features/Conversation and MainChatInput for custom features.
 */
const Conversation = memo(() => {
  const { t } = useTranslation('chat');
  const context = useAgentContext();
  const messageDeepLink = useMessageDeepLink();

  // Get raw dbMessages from ChatStore for this context
  // ConversationStore will parse them internally to generate displayMessages
  const chatKey = messageMapKey(context);
  const replaceMessages = useChatStore((s) => s.replaceMessages);
  const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);

  log('contextKey %s: %o', chatKey, messages);

  // Get operation state from ChatStore for reactive updates
  const operationState = useOperationState(context);

  // Get actionsBar config with branching support from ChatStore
  const actionsBarConfig = useActionsBarConfig();

  // Heterogeneous agents (Claude Code, etc.) use a simplified input — their
  // toolchain/memory/model are managed by the external runtime, so Orvilo's
  // model/tools/memory/KB/MCP/runtime-mode pickers don't apply.
  const isHeterogeneousAgent = useAgentStore(
    agentByIdSelectors.isAgentHeterogeneousById(context.agentId),
  );

  // Subagent threads (spawned by an external agent's subagent tool call) are
  // read-only — the parent agent drives their execution, so hide the input.
  const isSubagentThread = useChatStore(threadSelectors.isActiveThreadSubagent);
  const inboxAgentConfigInit = useAgentStore(builtinAgentSelectors.isInboxAgentConfigInit);
  const agentSlug = useAgentStore((s) =>
    context.agentId ? s.agentMap[context.agentId]?.slug : undefined,
  );
  const isInboxResolving = shouldShowInboxAgentResolving({
    agentId: context.agentId,
    agentSlug,
    inboxAgentConfigInit,
    topicId: context.topicId,
  });

  // Auto-reconnect to running Gateway operation on topic load
  const runningOperation = useChatStore((s) =>
    context.topicId
      ? topicSelectors.getTopicById(context.topicId)(s)?.metadata?.runningOperation
      : undefined,
  );
  useGatewayReconnect(context.topicId, runningOperation, context.agentId);

  // While the topic is parked as `scheduled`, pull the cron dispatch into the
  // store when `runAt` passes — nothing pushes it, and the reconnect above
  // can't fire until the synced `runningOperation` lands in the topic map.
  useScheduledRunWatch(context.topicId);

  const agentChatConfig = useAgentStore(chatConfigByIdSelectors.getChatConfigById(context.agentId));
  const chatFollowUpHooks = useChatFollowUp({
    agentChatConfig,
    conversationKey: chatKey,
    threadId: context.threadId ?? undefined,
    topicId: context.topicId ?? undefined,
  });
  const businessAnalyticsHooks = useBusinessConversationAnalytics(context);

  // A topic still awaiting its transfer backfill shows a placeholder instead
  // of an empty (not-yet-migrated) history, and blocks sending — the server
  // could not assemble the missing context anyway. Opening it jumps it to the
  // front of the backfill queue, so the wait is typically a few seconds.
  const { job: migrationJob, topicPending } = useTopicMigrationPending(
    { agentId: context.agentId },
    context.topicId,
  );

  const hooks = useMemo(
    () => mergeConversationHooks(businessAnalyticsHooks, chatFollowUpHooks),
    [businessAnalyticsHooks, chatFollowUpHooks],
  );

  const chatInput = !isSubagentThread && !topicPending && (
    <MessageForwardFooter>
      {isHeterogeneousAgent ? <HeterogeneousChatInput /> : <MainChatInput />}
    </MessageForwardFooter>
  );

  return (
    <ConversationProvider
      actionsBar={actionsBarConfig}
      context={context}
      hasInitMessages={!!messages}
      hooks={hooks}
      messages={messages}
      operationState={operationState}
      onMessagesChange={(messages, ctx, meta) => {
        replaceMessages(messages, { context: ctx, source: meta?.source });
      }}
    >
      <ChatbotPage
        composer={chatInput}
        header={<ToolAuthAlert />}
        messageDeepLink={messageDeepLink}
        resolving={isInboxResolving}
        footer={
          isSubagentThread ? (
            <p className="text-center text-xs text-muted-foreground">
              {t('thread.subagentReadOnlyHint')}
            </p>
          ) : undefined
        }
        placeholder={
          topicPending ? (
            <TopicMigrationPlaceholder agentId={context.agentId} topicId={context.topicId} />
          ) : undefined
        }
      />
      {topicPending && (
        <div className="flex items-center justify-center py-1.5 px-4">
          <span style={{ color: cssVar.colorTextDescription, fontSize: 12, textAlign: 'center' }}>
            {t(
              migrationJob?.type === 'copy'
                ? 'transferMigration.inputDisabledHintCopy'
                : 'transferMigration.inputDisabledHint',
            )}
          </span>
        </div>
      )}
      <ExposeMainEditor />
      <ComposerDraftReceiver />
      <ThreadHydration />
      <ForwardMessageDispatcher />
      {/* Held back while the topic is still migrating: the composer above is
          already disabled, and letting `?message=` through would send into the
          not-yet-migrated history this screen is waiting for. The param stays
          in the URL, so the send fires once the backfill lands. */}
      {!topicPending && (
        <Suspense>
          <MessageFromUrl />
        </Suspense>
      )}
    </ConversationProvider>
  );
});

Conversation.displayName = 'ConversationArea';

export default Conversation;
