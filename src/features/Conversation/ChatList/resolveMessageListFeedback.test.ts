import { describe, expect, it } from 'vitest';

import { resolveMessageListFeedback } from './resolveMessageListFeedback';

const NOT_FOUND_ERROR = Object.assign(new Error('Resource not found'), {
  data: { code: 'NOT_FOUND', httpStatus: 404 },
});

describe('resolveMessageListFeedback', () => {
  it.each([
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: true,
      },
      name: 'first load pending',
      state: {
        error: undefined,
        isNewConversation: false,
        isStreaming: false,
        messagesInit: false,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: true,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'first load failed',
      state: {
        error: new Error('offline'),
        isNewConversation: false,
        isStreaming: false,
        messagesInit: false,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'settled list validating silently',
      state: { error: undefined, isNewConversation: false, isStreaming: false, messagesInit: true },
    },
    {
      expected: {
        showBackgroundError: true,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'settled empty list failed in the background',
      state: {
        error: new Error('offline'),
        isNewConversation: false,
        isStreaming: false,
        messagesInit: true,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'streaming keeps its existing source of truth',
      state: {
        error: new Error('offline'),
        isNewConversation: false,
        isStreaming: true,
        messagesInit: true,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'new conversation remains on welcome',
      state: {
        error: undefined,
        isNewConversation: true,
        isStreaming: false,
        messagesInit: false,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: true,
        showSkeleton: false,
      },
      name: 'first load NOT_FOUND shows the deleted state, not a raw error',
      state: {
        error: NOT_FOUND_ERROR,
        isNewConversation: false,
        isStreaming: false,
        messagesInit: false,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: true,
        showSkeleton: false,
      },
      name: 'background NOT_FOUND also owns the surface (topic deleted mid-view)',
      state: {
        error: NOT_FOUND_ERROR,
        isNewConversation: false,
        isStreaming: false,
        messagesInit: true,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'streaming wins over a NOT_FOUND',
      state: {
        error: NOT_FOUND_ERROR,
        isNewConversation: false,
        isStreaming: true,
        messagesInit: false,
      },
    },
    {
      expected: {
        showBackgroundError: false,
        showFirstLoadError: false,
        showNotFound: false,
        showSkeleton: false,
      },
      name: 'new conversation never shows the deleted state',
      state: {
        error: NOT_FOUND_ERROR,
        isNewConversation: true,
        isStreaming: false,
        messagesInit: false,
      },
    },
  ])('$name', ({ expected, state }) => {
    expect(resolveMessageListFeedback(state)).toEqual(expected);
  });
});
