'use client';

import type { ComponentProps } from 'react';

import type { NativeMathRenderer } from '@/components/NativePageEditor/math';
import { NativeChatRuntimeContext } from '@/features/ChatInput/native/NativeChatRuntimeContext';

import ChatInput from './index';

export interface NativeConversationChatInputProps extends ComponentProps<typeof ChatInput> {
  mathRenderer: NativeMathRenderer;
}

/** Opt-in direct conversation entry: all real conversation send/schedule/stop,
 * permission, attachment and context-selection owners stay in ChatInput. */
export function NativeConversationChatInput({
  mathRenderer,
  ...props
}: NativeConversationChatInputProps) {
  return (
    <NativeChatRuntimeContext value={mathRenderer}>
      <ChatInput {...props} />
    </NativeChatRuntimeContext>
  );
}
