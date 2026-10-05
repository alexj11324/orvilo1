import { normalizeAsyncError } from '@/libs/swr/normalizeError';

interface ResolveMessageListFeedbackOptions {
  error?: unknown;
  isNewConversation: boolean;
  isStreaming: boolean;
  messagesInit: boolean;
}

export const resolveMessageListFeedback = ({
  error,
  isNewConversation,
  isStreaming,
  messagesInit,
}: ResolveMessageListFeedbackOptions) => {
  const hasError = error !== undefined && error !== null;
  const normalized = hasError ? normalizeAsyncError(error) : undefined;
  const isNotFoundError = normalized?.code === 'NOT_FOUND' || normalized?.status === 404;

  return {
    showBackgroundError: messagesInit && hasError && !isStreaming && !isNotFoundError,
    showFirstLoadError: !messagesInit && !isNewConversation && hasError && !isNotFoundError,
    // A NOT_FOUND owns the whole surface regardless of init state — the topic
    // is gone, so neither a skeleton retry nor a generic retry affordance is
    // honest. Streaming wins over the 404 (a transient failure mid-stream
    // must not nuke an in-flight run).
    showNotFound: hasError && isNotFoundError && !isStreaming && !isNewConversation,
    showSkeleton: !messagesInit && !isNewConversation && !hasError,
  };
};
