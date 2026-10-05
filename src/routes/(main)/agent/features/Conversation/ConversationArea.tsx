'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import debug from 'debug';
import { Loader2 } from 'lucide-react';
import { memo, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessConversationAnalytics } from '@/business/client/hooks/useBusinessConversationAnalytics';
import AgentHome from '@/features/AgentHome';
import {
  TopicMigrationPlaceholder,
  useTopicMigrationPending,
} from '@/features/AgentTransferMigration';
import ChatMiniMap from '@/features/ChatMiniMap';
import { ChatList, ConversationProvider } from '@/features/Conversation';
import ToolAuthAlert from '@/features/Conversation/AgentWelcome/ToolAuthAlert';
import { useMessageDeepLink } from '@/features/Conversation/ChatList/hooks/useMessageDeepLink';
import ComposerDraftReceiver from '@/features/Conversation/ComposerDraftReceiver';
import { useChatFollowUp } from '@/features/Conversation/hooks/useChatFollowUp';
import {
  ForwardMessageDispatcher,
  MessageForwardFooter,
} from '@/features/Conversation/MessageForward';
import SplitDropZone from '@/features/Conversation/SplitDropZone';
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

import ExamplePrompts from './ExamplePrompts';
import ExposeMainEditor from './ExposeMainEditor';
import HeterogeneousChatInput from './HeterogeneousChatInput';
import InboxAgentLanding, {
  isInboxAgentRouteTarget,
  shouldShowInboxAgentLanding,
  shouldShowInboxAgentResolving,
} from './InboxAgentLanding';
import MainChatInput from './MainChatInput';
import MessageFromUrl from './MainChatInput/MessageFromUrl';
import ThreadHydration from './ThreadHydration';
import { useActionsBarConfig } from './useActionsBarConfig';

const log = debug('orvilo-render:agent:ConversationArea');

const styles = createStaticStyles(({ css }) => ({
  // When the chat column is wide enough for the header to float above the
  // full-bleed list (see Conversation/Header), this in-list spacer keeps the
  // first message clear of it while still letting content scroll underneath.
  // A list row is used instead of scroller padding, which breaks virtua's
  // offset math. Height matches the 44px NavHeader.
  floatingHeaderSpacer: css`
    height: 0;

    @container agent-chat-layout (min-width: 1200px) {
      height: 44px;
    }
  `,
}));

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
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const inboxAgentConfigInit = useAgentStore(builtinAgentSelectors.isInboxAgentConfigInit);
  const agentSlug = useAgentStore((s) =>
    context.agentId ? s.agentMap[context.agentId]?.slug : undefined,
  );
  const isInboxLanding = shouldShowInboxAgentLanding({
    agentId: context.agentId,
    inboxAgentId,
    topicId: context.topicId,
  });
  // `/agent/inbox` (and a hydrated inbox row) targets the landing even before
  // `builtinAgentIdMap` resolves the real id — without this the populated
  // path renders `AgentHome`'s deprecated welcome card for a few frames.
  const isInboxRouteTarget = isInboxAgentRouteTarget({
    agentId: context.agentId,
    agentSlug,
  });
  const isInboxResolving = shouldShowInboxAgentResolving({
    agentId: context.agentId,
    agentSlug,
    inboxAgentConfigInit,
    topicId: context.topicId,
  });
  const showInboxLanding = isInboxLanding || (!context.topicId && isInboxRouteTarget);

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
      {showInboxLanding ? (
        <InboxAgentLanding>
          <ToolAuthAlert />
          {isInboxResolving ? (
            // Neutral loading while the builtin map resolves the real inbox
            // id — the composer must not send under the `inbox` slug, and the
            // populated path would flash the deprecated AgentHome welcome.
            <div
              aria-label={t('loading', { ns: 'common' })}
              className="flex flex-col items-center flex-1 justify-center"
              role={'status'}
            >
              <Loader2 className="animate-spin" color={cssVar.colorTextDescription} size={20} />
            </div>
          ) : (
            /* The first-agent gate lives at the (main) layout now — while no
               usable agent exists it covers the whole window, so by the time
               this renders the composer is always backed by a real agent. */
            <>
              {chatInput}
              {/* Reference state B: the examples row sits inside the same
                  centered group as the composer, so its appearance lifts the
                  composer (~91px in the reference) instead of needing a fixed
                  offset. */}
              <ExamplePrompts />
            </>
          )}
        </InboxAgentLanding>
      ) : (
        <>
          <SplitDropZone>
            <div
              className="flex flex-col flex-1"
              style={{
                width: '100%',

                overflowX: 'hidden',
                overflowY: 'auto',
                position: 'relative',
              }}
            >
              {topicPending ? (
                <TopicMigrationPlaceholder agentId={context.agentId} topicId={context.topicId} />
              ) : (
                <ChatList
                  headerSlot={<div aria-hidden className={styles.floatingHeaderSpacer} />}
                  messageDeepLink={messageDeepLink}
                  welcome={<AgentHome />}
                  footerSlot={
                    isSubagentThread ? (
                      <div className="flex items-center justify-center py-1.5 px-4">
                        <span
                          style={{
                            color: cssVar.colorTextDescription,
                            fontSize: 12,
                            textAlign: 'center',
                          }}
                        >
                          {t('thread.subagentReadOnlyHint')}
                        </span>
                      </div>
                    ) : undefined
                  }
                />
              )}
            </div>
          </SplitDropZone>
          {chatInput}
        </>
      )}
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
      <ChatMiniMap />
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
