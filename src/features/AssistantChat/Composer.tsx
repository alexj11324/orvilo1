'use client';

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import { ArrowUp, CalendarClock, Paperclip, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessChatInputAlerts } from '@/business/client/hooks/useBusinessChatInputSendAreaPrefix';
import { useUploadFiles } from '@/components/DragUploadZone/useUploadFiles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import Agent from '@/features/ChatInput/ActionBar/Agent';
import Tools from '@/features/ChatInput/ActionBar/Tools';
import ControlBar from '@/features/ChatInput/ControlBar';
import {
  conversationDraftKey,
  getDraft,
  removeDraft,
  saveDraft,
} from '@/features/ChatInput/draftStorage';
import { useEffectiveModel } from '@/features/ChatInput/hooks/useEffectiveModel';
import { createStore, Provider } from '@/features/ChatInput/store';
import { buildMessageContextSelections } from '@/features/ChatInput/utils/contextSelections';
import type { ChatInputProps } from '@/features/Conversation/ChatInput';
import OpStatusTray from '@/features/Conversation/ChatInput/OpStatusTray';
import QueueTray from '@/features/Conversation/ChatInput/QueueTray';
import GoalTray from '@/features/Conversation/ChatInput/VerifyTray/GoalTray';
import { useConversationResourceAccess } from '@/features/Conversation/hooks/useConversationResourceAccess';
import InterventionBar from '@/features/Conversation/InterventionBar';
import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
  useConversationStoreApi,
} from '@/features/Conversation/store';
import TodoProgress from '@/features/Conversation/TodoProgress';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { fileChatSelectors, useFileStore } from '@/store/file';

import {
  decodeComposerDraft,
  encodeComposerDraft,
  recoverComposerDraft,
  runComposerAction,
  submitComposerTurn,
} from './composerDraft';

/** assistant-ui owns the editor. This store supplies only Orvilo domain controls. */
export default function AssistantChatComposer(props: ChatInputProps) {
  const context = useConversationStore((s) => s.context);
  const key = conversationDraftKey(context, messageMapKey(context));
  return <ComposerSession key={key} {...props} draftKey={key} />;
}

function ComposerSession({
  draftKey,
  disableSend,
  disableQueue,
  sendButtonProps,
  controlBarSlot,
  showControlBar = true,
  rightActions = [],
  leftActions = [],
  extraActionItems,
  onEditorReady,
  isConfigLoading,
  sendAreaPrefix,
}: ChatInputProps & { draftKey: string }) {
  const { t } = useTranslation('chat');
  const access = useConversationResourceAccess();
  const accessBlocked = !access.canUseResource || access.isAccessLoading;
  const api = useConversationStoreApi();
  const context = useConversationStore((s) => s.context);
  const contextKey = messageMapKey(context);
  const agentId = context.agentId ?? '';
  const isRunning = useConversationStore(messageStateSelectors.isInputVisiblyLoading);
  const error = useConversationStore(messageStateSelectors.sendMessageError);
  const interventions = useConversationStore(
    dataSelectors.pendingInterventions,
    (a, b) =>
      a.length === b.length &&
      a.every(
        (item, i) => item.toolCallId === b[i].toolCallId && item.requestArgs === b[i].requestArgs,
      ),
  );
  const files = useFileStore(fileChatSelectors.chatUploadFileList);
  const selections = useFileStore(fileChatSelectors.chatContextSelections(contextKey));
  const uploading = useFileStore(fileChatSelectors.isUploadingFiles);
  const hasQueue = useChatStore((s) => operationSelectors.queuedMessageCount(context)(s) > 0);
  const model = useEffectiveModel(agentId);
  const { handleUploadFiles } = useUploadFiles({ agentId, ...model });
  const uploadFiles = (files: File[]) => runComposerAction(access, () => handleUploadFiles(files));
  const businessAlerts = useBusinessChatInputAlerts();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const revision = useRef(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  const [scheduling, setScheduling] = useState(false);
  const [text, setText] = useState(() => decodeComposerDraft(getDraft(draftKey)));
  const textRef = useRef(text);
  const controls = useState(() =>
    createStore({ agentId, contextSelectionKey: contextKey, rightActions, leftActions }),
  )[0];
  const sendRef = useRef<() => Promise<void>>(async () => {});
  const runtime = useExternalStoreRuntime({
    messages: [],
    isRunning,
    onNew: async () => sendRef.current(),
    onCancel: async () => {
      await runComposerAction(access, () => api.getState().stopGenerating());
    },
  });

  const update = (value: string) => {
    if (value !== textRef.current) revision.current += 1;
    textRef.current = value;
    setText(value);
    runtime.thread.composer.setText(value);
    api.getState().updateInputMessage(value);
    controls.setState({ markdownContent: value, isContentEmpty: !value.trim() });
    if (value) saveDraft(draftKey, encodeComposerDraft(value));
    else removeDraft(draftKey);
  };
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    controls.setState({ agentId, contextSelectionKey: contextKey, rightActions, leftActions });
  }, [agentId, contextKey, controls, leftActions, rightActions]);

  useEffect(() => {
    mounted.current = true;
    const editor = {
      focus: () => inputRef.current?.focus(),
      getMarkdownContent: () => textRef.current,
      getJSONState: () => undefined,
      getEditorState: () => undefined,
      setDocument: (format: string, value: string | Record<string, unknown>) => {
        if (!mounted.current) return;
        updateRef.current(
          format === 'json' && typeof value === 'object'
            ? decodeComposerDraft(value)
            : String(value),
        );
      },
      setJSONState: (value: Record<string, unknown>) => {
        if (mounted.current) updateRef.current(decodeComposerDraft(value));
      },
      clearContent: () => updateRef.current(''),
    };
    runtime.thread.composer.setText(textRef.current);
    api.getState().updateInputMessage(textRef.current);
    api.getState().setEditor(editor);
    onEditorReadyRef.current?.(editor);
    return () => {
      mounted.current = false;
      if (api.getState().editor === editor) api.setState({ editor: null });
      if (useChatStore.getState().mainInputEditor === editor)
        useChatStore.setState({ mainInputEditor: null });
    };
  }, [api, runtime, draftKey]);

  const blocked =
    accessBlocked ||
    !!disableSend ||
    !!sendButtonProps?.disabled ||
    uploading ||
    scheduling ||
    (!!disableQueue && isRunning);
  const empty = !text.trim() && !files.length && !selections.length;

  sendRef.current = () =>
    runComposerAction(access, async () => {
      const live = api.getState();
      const fileStore = useFileStore.getState();
      const message = textRef.current;
      const currentFiles = fileChatSelectors.chatUploadFileList(fileStore);
      const currentSelections = fileChatSelectors.chatContextSelections(contextKey)(fileStore);
      if (
        pending.current ||
        isConfigLoading ||
        interventions.length > 0 ||
        disableSend ||
        sendButtonProps?.disabled ||
        fileChatSelectors.isUploadingFiles(fileStore)
      )
        return;
      if (
        disableQueue &&
        operationSelectors.isInputLoadingByContext(live.context)(useChatStore.getState())
      )
        return;
      if (!message.trim() && !currentFiles.length && !currentSelections.length) return;
      const clearAttachments = () => {
        fileStore.dispatchChatUploadFileList({
          type: 'removeFiles',
          ids: currentFiles.map((file) => file.id),
        });
        currentSelections.forEach((selection) =>
          fileStore.removeChatContextSelection({ contextKey, id: selection.id }),
        );
      };
      if (live.scheduledSendAt) {
        pending.current = true;
        setScheduling(true);
        const originalRevision = revision.current;
        try {
          if (await live.commitScheduledSend(message, currentFiles)) {
            clearAttachments();
            if (mounted.current && revision.current === originalRevision) updateRef.current('');
          }
        } finally {
          pending.current = false;
          if (mounted.current) setScheduling(false);
        }
        return;
      }
      updateRef.current('');
      clearAttachments();
      const clearedRevision = revision.current;
      const restore = () => {
        const currentKey = conversationDraftKey(
          api.getState().context,
          messageMapKey(api.getState().context),
        );
        recoverComposerDraft({
          mounted: mounted.current,
          sentKey: draftKey,
          currentKey,
          clearedRevision,
          currentRevision: revision.current,
          currentText: textRef.current,
          restoreText: () => updateRef.current(message),
          preserveDraft: () => {
            if (!getDraft(draftKey)) saveDraft(draftKey, encodeComposerDraft(message));
          },
          restoreAttachments: () => {
            const state = useFileStore.getState();
            const ids = new Set(state.chatUploadFileList.map((file) => file.id));
            state.dispatchChatUploadFileList({
              type: 'addFiles',
              files: currentFiles.filter((file) => !ids.has(file.id)),
            });
            const recoveryContextKey = messageMapKey(api.getState().context);
            const selectionIds = new Set(
              fileChatSelectors
                .chatContextSelections(recoveryContextKey)(state)
                .map((selection) => selection.id),
            );
            currentSelections
              .filter((selection) => !selectionIds.has(selection.id))
              .forEach((selection) =>
                state.addChatContextSelection({ contextKey: recoveryContextKey, selection }),
              );
          },
        });
      };
      await submitComposerTurn(
        (callbacks) =>
          live.sendMessage({
            message,
            files: currentFiles,
            ...buildMessageContextSelections(currentSelections),
            ...callbacks,
          }),
        restore,
      );
    });

  const send = () => {
    void sendRef.current();
  };
  const scheduleEnabled = extraActionItems?.some((item) => item.key === 'heteroPlus');
  return (
    <Provider createStore={() => controls}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div
          className="mx-auto flex w-full max-w-[44rem] flex-col gap-2 px-4 pb-4"
          data-testid="assistant-composer"
        >
          {interventions.length > 0 && <InterventionBar interventions={interventions} />}
          {error && (
            <div className="text-destructive text-sm" role="alert">
              {t('input.errorMsg', { errorMsg: error })}
            </div>
          )}
          {businessAlerts}
          {!disableQueue && hasQueue && <QueueTray />}
          <TodoProgress />
          <OpStatusTray />
          <GoalTray />
          <ComposerPrimitive.Root
            className="border-border bg-background rounded-3xl border p-2 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring"
            style={{ display: interventions.length ? 'none' : undefined }}
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            {(files.length > 0 || selections.length > 0) && (
              <div className="flex flex-wrap gap-2 px-2 pt-2">
                {files.map((file) => (
                  <div
                    className="bg-muted flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-xs"
                    key={file.id}
                  >
                    <span className="truncate">{file.file.name}</span>
                    <span>
                      {file.error ||
                        (uploading
                          ? t('feedback.fields.screenshot.uploading', { ns: 'common' })
                          : '')}
                    </span>
                    <Button
                      aria-label={t('remove', { ns: 'common' })}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => void useFileStore.getState().removeChatUploadFile(file.id)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
                {selections.map((selection) => (
                  <div
                    className="bg-muted flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
                    key={selection.id}
                  >
                    <span className="max-w-48 truncate">{selection.title || selection.id}</span>
                    <Button
                      aria-label={t('remove', { ns: 'common' })}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        useFileStore
                          .getState()
                          .removeChatContextSelection({ contextKey, id: selection.id })
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <ComposerPrimitive.Input
              addAttachmentOnPaste={false}
              aria-label={t('assistantUi.placeholder')}
              cancelOnEscape={false}
              className="text-foreground placeholder:text-muted-foreground min-h-16 w-full resize-none bg-transparent px-3 py-2 text-base outline-none"
              maxRows={8}
              placeholder={t('assistantUi.placeholder')}
              ref={inputRef}
              onChange={(event) => update(event.target.value)}
              onKeyDown={(event) => {
                // The display runtime is running, but Orvilo accepts queued follow-ups.
                // assistant-ui otherwise suppresses Enter without its own queue adapter.
                if (
                  isRunning &&
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void uploadFiles(Array.from(event.clipboardData.files));
                }
              }}
            />
            <div className="flex min-w-0 items-center justify-between gap-2 px-1 pb-1">
              <div className="flex min-w-0 items-center gap-1">
                <Input
                  multiple
                  className="hidden"
                  ref={fileRef}
                  type="file"
                  onChange={(event) => {
                    void uploadFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                <Button
                  aria-label={t('assistantUi.attach')}
                  className="rounded-full"
                  disabled={uploading || accessBlocked}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={18} />
                </Button>
                {leftActions.flat().some((action) => action === 'tools' || action === 'plus') && (
                  <Tools />
                )}
                {scheduleEnabled && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={t('assistantUi.schedule')}
                          className="rounded-full"
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <CalendarClock size={18} />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="start" side="top">
                      {[1, 3, 6, 12, 24].map((hours) => (
                        <DropdownMenuItem
                          key={hours}
                          onClick={() => {
                            const date = new Date();
                            date.setHours(date.getHours() + hours, 0, 0, 0);
                            api.getState().setScheduledSendAt(date.toISOString());
                          }}
                        >
                          {t('input.schedule.inHours', { count: hours })}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {extraActionItems
                  ?.filter((item) => item.key !== 'heteroPlus')
                  .map((item) => (
                    <span key={item.key}>{item.children}</span>
                  ))}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {rightActions.flat().includes('agent') && <Agent />}
                {sendAreaPrefix}
                {isRunning && (
                  <ComposerPrimitive.Cancel
                    aria-label={t('input.stop')}
                    className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
                    disabled={accessBlocked}
                  >
                    <Square fill="currentColor" size={14} />
                  </ComposerPrimitive.Cancel>
                )}
                {isRunning || !text.trim() ? (
                  <Button
                    aria-label={t(isRunning ? 'assistantUi.queue' : 'input.send')}
                    className="rounded-full"
                    disabled={blocked || empty || isConfigLoading}
                    size="icon"
                    type="button"
                    onClick={send}
                  >
                    <ArrowUp size={18} />
                  </Button>
                ) : (
                  <ComposerPrimitive.Send
                    aria-label={t('input.send')}
                    className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                    disabled={blocked || isConfigLoading}
                    onClick={(event) => {
                      event.preventDefault();
                      send();
                    }}
                  >
                    <ArrowUp size={18} />
                  </ComposerPrimitive.Send>
                )}
              </div>
            </div>
          </ComposerPrimitive.Root>
          {showControlBar && (controlBarSlot ?? <ControlBar />)}
        </div>
      </AssistantRuntimeProvider>
    </Provider>
  );
}
