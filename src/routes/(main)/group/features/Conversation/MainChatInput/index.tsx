'use client';

import { memo } from 'react';

import { type ActionKeys } from '@/features/ChatInput';
import HeteroControlBar from '@/features/ChatInput/ControlBar/HeteroControlBar';
import { ChatInput } from '@/features/Conversation';
import { useConversationStore } from '@/features/Conversation/store';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

import { useSendMenuItems } from './useSendMenuItems';

const leftActions: ActionKeys[] = [
  'search',
  'memory',
  'fileUpload',
  'tools',
  'voiceDictation',
  '---',
  ['typo', 'params', 'clear'],
];

// The group composer exposes the bound agent (supervisor) like every other
// chat surface — model selection lives only in per-agent settings.
const rightActions: ActionKeys[] = ['agent', 'voiceMessage', 'contextWindow'];

/**
 * MainChatInput
 *
 * Custom ChatInput implementation for main chat page.
 * Uses ChatInput from @/features/Conversation which handles all send logic
 * including error alerts display.
 * Only adds MessageFromUrl for desktop mode.
 */
const MainChatInput = memo(() => {
  const sendMenuItems = useSendMenuItems();
  const agentId = useConversationStore((s) => s.context.agentId);
  const isHeterogeneous = useAgentStore(agentByIdSelectors.isAgentHeterogeneousById(agentId));

  return (
    <ChatInput
      skipScrollMarginWithList
      controlBarSlot={isHeterogeneous ? <HeteroControlBar /> : undefined}
      leftActions={leftActions}
      rightActions={rightActions}
      sendMenu={{ items: sendMenuItems }}
      onEditorReady={(instance) => {
        // Sync to global ChatStore for compatibility with other features
        useChatStore.setState({ mainInputEditor: instance });
      }}
    />
  );
});

MainChatInput.displayName = 'MainChatInput';

export default MainChatInput;
