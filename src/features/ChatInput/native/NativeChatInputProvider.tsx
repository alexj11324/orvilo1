import type { ReactNode } from 'react';
import { memo, useRef } from 'react';

import type { NativeMathRenderer } from '@/components/NativePageEditor/math';

import { createStore, Provider } from '../store';
import { DEFAULT_CHAT_INPUT_FEATURE } from '../store/initialState';
import type { StoreUpdaterProps } from '../StoreUpdater';
import StoreUpdater from '../StoreUpdater';
import { NativeChatRuntimeContext } from './NativeChatRuntimeContext';

interface NativeChatInputProviderProps extends StoreUpdaterProps {
  children: ReactNode;
  mathRenderer: NativeMathRenderer;
}

export const NativeChatInputProvider = memo<NativeChatInputProviderProps>(
  ({
    agentId,
    canRecordVoiceMessage,
    children,
    mathRenderer,
    contextSelectionKey,
    contextWindowMessages,
    draftKey,
    feature = DEFAULT_CHAT_INPUT_FEATURE,
    leftActions,
    rightActions,
    mobile,
    sendButtonProps,
    onSend,
    onVoiceMessageSend,
    sendMenu,
    chatInputEditorRef,
    onMarkdownContentChange,
    mentionItems,
    allowExpand = true,
    slashPlacement,
    getMessages,
    resolveSendBlocked,
  }) => {
    const slashMenuRef = useRef<HTMLDivElement>(null);

    return (
      <Provider
        createStore={() =>
          createStore({
            allowExpand,
            canRecordVoiceMessage,
            contextSelectionKey,
            contextWindowMessages,
            draftKey,
            feature,
            leftActions,
            mentionItems,
            mobile,
            rightActions,
            onVoiceMessageSend,
            sendButtonProps,
            sendMenu,
            slashMenuRef,
            slashPlacement,
          })
        }
      >
        <StoreUpdater
          agentId={agentId}
          allowExpand={allowExpand}
          canRecordVoiceMessage={canRecordVoiceMessage}
          chatInputEditorRef={chatInputEditorRef}
          contextSelectionKey={contextSelectionKey}
          contextWindowMessages={contextWindowMessages}
          draftKey={draftKey}
          feature={feature}
          getMessages={getMessages}
          leftActions={leftActions}
          mentionItems={mentionItems}
          mobile={mobile}
          resolveSendBlocked={resolveSendBlocked}
          rightActions={rightActions}
          sendButtonProps={sendButtonProps}
          sendMenu={sendMenu}
          slashPlacement={slashPlacement}
          onMarkdownContentChange={onMarkdownContentChange}
          onSend={onSend}
          onVoiceMessageSend={onVoiceMessageSend}
        />
        <NativeChatRuntimeContext value={mathRenderer}>{children}</NativeChatRuntimeContext>
      </Provider>
    );
  },
);
