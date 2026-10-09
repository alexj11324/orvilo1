'use client';

import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import { ArrowDown } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageRefreshError } from '@/features/Conversation/ChatList/hooks/useMessageRefreshError';
import { resolveMessageListFeedback } from '@/features/Conversation/ChatList/resolveMessageListFeedback';
import {
  type MessageDeepLink,
  resolveMessageDeepLink,
} from '@/features/Conversation/ChatList/utils/messageDeepLink';
import { useConversationResourceAccess } from '@/features/Conversation/hooks/useConversationResourceAccess';
import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
  useConversationStoreApi,
} from '@/features/Conversation/store';
import { TopicNotFoundRedirect } from '@/features/TopicNotFound';
import { getMessageListCacheIdentity } from '@/services/message/cache';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';

import ChatMessage from './Message';
import { toAssistantMessage } from './messages';

interface Props {
  composer: ReactNode;
  disabled?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  messageDeepLink?: MessageDeepLink;
}

export default function AssistantThread({
  composer,
  disabled = false,
  footer,
  header,
  messageDeepLink,
}: Props) {
  const { t } = useTranslation('chat');
  const store = useConversationStoreApi();
  const { canUseResource, isAccessLoading } = useConversationResourceAccess();
  const readOnly = disabled || !canUseResource || isAccessLoading;
  const context = useConversationStore((s) => s.context);
  const messages = useConversationStore(dataSelectors.displayMessages);
  const initialized = useConversationStore(dataSelectors.messagesInit);
  const skipFetch = useConversationStore(dataSelectors.skipFetch);
  const useFetchMessages = useConversationStore((s) => s.useFetchMessages);
  const running = useConversationStore(messageStateSelectors.isInputVisiblyLoading);
  const isCreating = useChatStore(
    (s) => !!context.topicId && s.creatingTopicIds.includes(context.topicId),
  );
  const active = useChatStore(operationSelectors.isAgentRuntimeRunningByContext(context));
  const response = useFetchMessages(context, {
    revalidateOnFocus: !active,
    skipFetch: skipFetch || isCreating,
  });
  const refresh = useMessageRefreshError({
    error: response.error,
    identity: getMessageListCacheIdentity(context),
    isValidating: response.isValidating,
    mutate: response.mutate,
  });
  const feedback = resolveMessageListFeedback({
    error: refresh.error,
    isNewConversation: !context.topicId,
    isStreaming: active,
    messagesInit: initialized,
  });
  const converted = useMemo(() => messages.map(toAssistantMessage), [messages]);
  const runtime = useExternalStoreRuntime({
    isDisabled: readOnly,
    isLoading: feedback.showSkeleton,
    isRunning: running,
    messages: converted,
    onNew: async () => {}, // The independently mounted composer owns send guards and draft state.
    onCancel: async () => store.getState().stopGenerating(),
    onEdit: readOnly
      ? undefined
      : async (message) => {
          if (!message.sourceId) return;
          const text = message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
          await store.getState().modifyMessageContent(message.sourceId, text);
        },
    onReload: readOnly
      ? undefined
      : async (parentId) => {
          if (parentId) await store.getState().regenerateUserMessage(parentId);
        },
  });
  const viewport = useRef<HTMLDivElement>(null);
  const resolved = useMemo(
    () =>
      resolveMessageDeepLink(
        messages,
        messages.map((m) => m.id),
        messageDeepLink,
      ),
    [messages, messageDeepLink],
  );
  useEffect(() => {
    if (!resolved || !viewport.current) return;
    const target = [...viewport.current.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (node) => node.dataset.messageId === resolved.displayMessageId,
    );
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    resolved.onHandled?.();
  }, [resolved]);

  if (feedback.showNotFound)
    return <TopicNotFoundRedirect topicId={context.topicId ?? undefined} />;
  const empty = messages.length === 0 && !feedback.showSkeleton && !feedback.showFirstLoadError;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root
        className="aui-root flex h-full min-h-0 flex-1 flex-col bg-background text-foreground"
        data-testid="assistant-chat"
        style={{ ['--thread-max-width' as string]: '44rem' }}
      >
        <ThreadPrimitive.Viewport
          className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth"
          ref={viewport}
          turnAnchor="bottom"
        >
          <div
            className={`mx-auto flex w-full max-w-[44rem] flex-1 flex-col px-4 pt-6 ${empty ? 'justify-center' : ''}`}
          >
            {header}
            {feedback.showFirstLoadError || feedback.showBackgroundError ? (
              <AsyncError
                error={refresh.error}
                retrying={refresh.isRetrying}
                onRetry={refresh.retry}
              />
            ) : null}
            {feedback.showSkeleton ? (
              <div
                aria-label={t('loading', { ns: 'common' })}
                className="space-y-6 py-8"
                role="status"
              >
                <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
                <Skeleton className="h-24 w-5/6 rounded-2xl" />
                <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
              </div>
            ) : empty ? (
              <div className="flex flex-col gap-3 px-2 pb-8">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('assistantUi.welcome')}
                </h1>
                <p className="text-base text-muted-foreground">{t('assistantUi.welcomeHint')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 pb-8">
                <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
              </div>
            )}
            <ThreadPrimitive.ViewportFooter
              className={`flex flex-col gap-3 bg-background pb-4 ${empty ? '' : 'sticky bottom-0 mt-auto rounded-t-2xl pt-3'}`}
            >
              {!empty && (
                <ThreadPrimitive.ScrollToBottom asChild>
                  <Button
                    aria-label={t('assistantUi.scrollBottom')}
                    className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
                    size="icon"
                    variant="outline"
                  >
                    <ArrowDown />
                  </Button>
                </ThreadPrimitive.ScrollToBottom>
              )}
              {composer}
              {footer}
            </ThreadPrimitive.ViewportFooter>
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
