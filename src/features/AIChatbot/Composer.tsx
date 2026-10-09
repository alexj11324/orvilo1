'use client';

import { cn } from 'cn';
import { Settings2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import Agent from '@/features/ChatInput/ActionBar/Agent';
import { ActionBarContext } from '@/features/ChatInput/ActionBar/context';
import Plus from '@/features/ChatInput/ActionBar/Plus';
import ContextWindow from '@/features/ChatInput/ActionBar/Token';
import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
import ControlBar from '@/features/ChatInput/ControlBar';
import ContextContainer from '@/features/ChatInput/Desktop/ContextContainer';
import VoiceDictation from '@/features/ChatInput/Dictation';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import InputEditor from '@/features/ChatInput/InputEditor';
import { useSkillDrop } from '@/features/ChatInput/InputEditor/ActionTag/useSkillDrop';
import { type PlaceholderVariant } from '@/features/ChatInput/InputEditor/Placeholder';
import { useTopicDrop } from '@/features/ChatInput/InputEditor/ReferTopic/useTopicDrop';
import { useWorkspaceFileDrop } from '@/features/ChatInput/InputEditor/useWorkspaceFileDrop';
import SendButton from '@/features/ChatInput/SendArea/SendButton';
import { useChatInputStore } from '@/features/ChatInput/store';
import TypoBar from '@/features/ChatInput/TypoBar';
import VoiceMessage from '@/features/ChatInput/VoiceMessage';
import { fileChatSelectors, useFileStore } from '@/store/file';

interface ComposerProps {
  controlBarSlot?: ReactNode;
  extraContent?: ReactNode;
  hidden?: boolean;
  isConfigLoading?: boolean;
  placeholder?: ReactNode;
  placeholderVariant?: PlaceholderVariant;
  primaryContent?: ReactNode;
  sendAreaPrefix?: ReactNode;
  showControlBar?: boolean;
}

/** Official Chatbot composition; Lexical remains the single document/draft owner. */
export default function Composer({
  controlBarSlot,
  extraContent,
  hidden,
  isConfigLoading,
  primaryContent,
  placeholder,
  placeholderVariant,
  sendAreaPrefix,
  showControlBar = true,
}: ComposerProps) {
  const { t } = useTranslation('common');
  const { canUseResource, canShowControls, isAccessLoading } = useChatInputResourceAccess();
  const [
    send,
    slashMenuRef,
    expand,
    showTypoBar,
    contextKey,
    audioMode,
    leftActions,
    rightActions,
    editor,
    setExpand,
  ] = useChatInputStore((s) => [
    s.handleSendButton,
    s.slashMenuRef,
    s.expand,
    s.showTypoBar,
    s.contextSelectionKey,
    s.activeAudioInputMode,
    s.leftActions,
    s.rightActions,
    s.editor,
    s.setExpand,
  ]);
  useEffect(() => {
    setExpand(false);
    editor?.focus();
  }, [contextKey, editor, setExpand]);
  const hasFiles = useFileStore(fileChatSelectors.chatUploadFileListHasItem);
  const hasSelections = useFileStore(fileChatSelectors.chatContextSelectionHasItem(contextKey));
  const actions = [...leftActions.flat(), ...rightActions.flat()];
  const skillDrop = useSkillDrop();
  const topicDrop = useTopicDrop();
  const fileDrop = useWorkspaceFileDrop();

  return (
    <div
      data-testid="chat-input"
      ref={slashMenuRef}
      style={{ display: hidden ? 'none' : undefined }}
      className={cn(
        'relative w-full',
        expand && 'fixed inset-4 z-50 flex w-auto flex-col bg-background',
      )}
      onDragOver={(event) => {
        skillDrop.onDragOver(event);
        topicDrop.onDragOver(event);
        fileDrop.onDragOver(event);
      }}
      onDrop={(event) => {
        skillDrop.onDrop(event);
        topicDrop.onDrop(event);
        fileDrop.onDrop(event);
      }}
    >
      <ActionBarContext
        value={{ actionSize: { blockSize: 32, size: 16 }, dropdownPlacement: 'top' }}
      >
        <PromptInput
          className={cn(expand && 'flex min-h-0 flex-1 flex-col')}
          data-testid="chatbot-composer"
          externalEditor={{
            onSubmit: (event) => {
              event.preventDefault();
              if (canUseResource && !isAccessLoading) send();
            },
          }}
          groupClassName={cn(
            'h-auto flex-col rounded-[8px] border-border bg-background shadow-xs has-disabled:bg-background has-disabled:opacity-100 dark:bg-background dark:has-disabled:bg-background',
            expand && 'min-h-0 flex-1',
          )}
        >
          <PromptInputHeader>
            {(hasFiles || hasSelections) && <ContextContainer />}
            {showTypoBar && <TypoBar />}
          </PromptInputHeader>
          <PromptInputBody
            className={cn(
              'block max-h-48 min-h-16 w-full overflow-y-auto p-3 text-sm leading-5 [&_[contenteditable]]:text-sm [&_[contenteditable]]:leading-5 [&_p]:leading-5',
              expand && 'max-h-none min-h-0 flex-1',
            )}
          >
            <InputEditor
              defaultRows={1}
              placeholder={placeholder}
              placeholderVariant={placeholderVariant}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="flex-wrap">
              {isConfigLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  {canShowControls && actions.includes('plus') && <Plus />}
                  {primaryContent}
                  {actions.includes('voiceDictation') && <VoiceDictation />}
                  {actions.includes('voiceMessage') && <VoiceMessage />}
                  {canShowControls && <Agent />}
                  <Popover>
                    <PopoverTrigger
                      render={
                        <PromptInputButton aria-label={t('settings')}>
                          <Settings2 className="size-4" />
                        </PromptInputButton>
                      }
                    />
                    <PopoverContent
                      align="start"
                      className="w-96 max-w-[calc(100vw-2rem)] space-y-3"
                      side="top"
                    >
                      {controlBarSlot ?? (showControlBar && <ControlBar />)}
                      <div className="flex flex-wrap items-center gap-2">
                        {(controlBarSlot || !showControlBar) && <ContextWindow />}
                        <ComposerExpandButton />
                        {extraContent}
                      </div>
                      <ChatInputNotice />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </PromptInputTools>
            <div className="flex shrink-0 items-center gap-1">
              {sendAreaPrefix}
              {!audioMode && <SendButton />}
            </div>
          </PromptInputFooter>
        </PromptInput>
      </ActionBarContext>
    </div>
  );
}
