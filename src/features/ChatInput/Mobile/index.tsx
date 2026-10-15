'use client';

import { cn } from 'cn';
import { memo } from 'react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
} from '@/components/ai-elements/prompt-input';
import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { useChatInputStore } from '@/features/ChatInput/store';
import dynamic from '@/libs/next/dynamic';

import ActionBar from '../ActionBar';
import InputEditor from '../InputEditor';
import SendArea from '../SendArea';

const FilePreview = dynamic(() => import('./FilePreview'), { ssr: false });

const styles = {
  container: '',
  fullscreen: 'absolute z-100 inset-0 w-full h-full p-3 bg-background',
  leftActions: 'flex-none min-w-0',
  leftSlot: 'overflow-hidden flex-1 min-w-0',
};

const DesktopChatInput = memo(() => {
  const [slashMenuRef, expand] = useChatInputStore((s) => [s.slashMenuRef, s.expand]);
  const leftActions = useChatInputStore((s) => s.leftActions);
  const send = useChatInputStore((s) => s.handleSendButton);
  const { canUseResource, isAccessLoading } = useChatInputResourceAccess();

  const fileNode = leftActions.flat().includes('fileUpload') && <FilePreview />;

  return (
    <>
      {!expand && fileNode}
      <div
        ref={slashMenuRef}
        className={cn(
          'flex flex-col gap-2 px-3 pb-3',
          cn(styles.container, expand && styles.fullscreen),
        )}
      >
        <PromptInput
          className={expand ? 'flex h-full min-h-0 flex-1 flex-col' : undefined}
          groupClassName="h-auto flex-col rounded-(--radius-card) border-border bg-card text-card-foreground"
          externalEditor={{
            onSubmit: (event) => {
              event.preventDefault();
              if (canUseResource && !isAccessLoading) send();
            },
          }}
        >
          <PromptInputHeader>
            <div className={cn('flex flex-row items-center gap-1', styles.leftSlot)}>
              <div className="flex flex-none flex-row items-center gap-0.5">
                <div className={cn('flex flex-row items-center', styles.leftActions)}>
                  <ActionBar disableCollapse />
                </div>
                <ComposerExpandButton />
              </div>
              <ChatInputNotice />
            </div>
          </PromptInputHeader>
          <PromptInputBody className="[&_[contenteditable]]:text-sm [&_[contenteditable]]:leading-5.5 [&_[contenteditable]]:[--lobe-markdown-font-size:var(--text-sm)] [&_[contenteditable]]:[--lobe-markdown-line-height:calc(22/14)] [&_[contenteditable]+div>span]:text-sm [&_[contenteditable]+div>span]:leading-5.5">
            {expand && fileNode}
            <InputEditor defaultRows={1} />
          </PromptInputBody>
          <PromptInputFooter className="ps-1 pe-2">
            <div />
            <SendArea hideContextWindow={false} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
});

DesktopChatInput.displayName = 'DesktopChatInput';

export default DesktopChatInput;
