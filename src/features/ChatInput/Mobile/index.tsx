'use client';

import { ChatInput, ChatInputActionBar } from '@lobehub/editor/react';
import { cn } from 'cn';
import { memo } from 'react';

import LobeThemeScope from '@/components/LobeThemeScope';
import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
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

  const fileNode = leftActions.flat().includes('fileUpload') && <FilePreview />;

  return (
    <LobeThemeScope>
      <>
        {!expand && fileNode}
        <div
          className={cn(
            'flex flex-col gap-2 px-3 pb-3',
            cn(styles.container, expand && styles.fullscreen),
          )}
        >
          <ChatInput
            fullscreen={expand}
            slashMenuRef={slashMenuRef}
            classNames={{
              body: '[&_[contenteditable]]:text-sm [&_[contenteditable]]:leading-5.5 [&_[contenteditable]]:[--lobe-markdown-font-size:var(--text-sm)] [&_[contenteditable]]:[--lobe-markdown-line-height:calc(22/14)] [&_[contenteditable]+div>span]:text-sm [&_[contenteditable]+div>span]:leading-5.5',
            }}
            footer={
              <ChatInputActionBar
                left={<div />}
                paddingInline="4px 8px"
                right={<SendArea hideContextWindow={false} />}
              />
            }
            header={
              <ChatInputActionBar
                left={
                  <div className={cn('flex flex-row items-center gap-1', styles.leftSlot)}>
                    <div className="flex flex-row items-center flex-none gap-0.5">
                      <div className={cn('flex flex-row items-center', styles.leftActions)}>
                        <ActionBar disableCollapse />
                      </div>
                      <ComposerExpandButton />
                    </div>
                    <ChatInputNotice />
                  </div>
                }
              />
            }
          >
            {expand && fileNode}
            <InputEditor defaultRows={1} />
          </ChatInput>
        </div>
      </>
    </LobeThemeScope>
  );
});

DesktopChatInput.displayName = 'DesktopChatInput';

export default DesktopChatInput;
