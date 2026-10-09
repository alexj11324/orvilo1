'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// eslint-disable-next-line no-restricted-imports -- User-requested Libraries.dev Orbs in the official Chatbot page.
import { ThinkingOrb } from 'thinking-orbs';

import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { ChatList } from '@/features/Conversation';
import type { MessageDeepLink } from '@/features/Conversation/ChatList/utils/messageDeepLink';
import SplitDropZone from '@/features/Conversation/SplitDropZone';

import { ChatbotSurfaceContext } from './context';
import Suggestions from './Suggestions';

interface ChatbotPageProps {
  composer?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  messageDeepLink?: MessageDeepLink;
  placeholder?: ReactNode;
  resolving?: boolean;
}

/** Adapted from the complete official example-chatbot, with real Orvilo adapters. */
export default function ChatbotPage({
  composer,
  footer,
  header,
  messageDeepLink,
  placeholder,
  resolving,
}: ChatbotPageProps) {
  const { t } = useTranslation('chat');
  return (
    <ChatbotSurfaceContext value>
      <section
        className="relative flex size-full min-h-0 flex-col divide-y overflow-hidden bg-background text-foreground"
        data-testid="ai-chatbot-page"
      >
        <SplitDropZone style={{ marginBlockEnd: 0 }}>
          {placeholder ?? (
            <ChatList
              footerSlot={footer}
              messageDeepLink={messageDeepLink}
              welcome={
                <div className="flex min-h-0 flex-1 flex-col">
                  {header}
                  <ConversationEmptyState
                    description={resolving ? undefined : t('chatbot.description')}
                    title={resolving ? t('loading', { ns: 'common' }) : t('chatbot.welcome')}
                    icon={
                      <ThinkingOrb
                        aria-hidden
                        size={64}
                        state={resolving ? 'connecting' : 'breathing'}
                      />
                    }
                  />
                </div>
              }
            />
          )}
        </SplitDropZone>
        {composer && !resolving && !placeholder && (
          <div className="grid shrink-0 gap-4 pt-4" data-testid="ai-chatbot-footer">
            <Suggestions />
            <div className="w-full px-4 pb-4">{composer}</div>
          </div>
        )}
      </section>
    </ChatbotSurfaceContext>
  );
}
