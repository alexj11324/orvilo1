import { ChatInput, ChatInputActionBar, SendButton, useEditor } from '@lobehub/editor/react';
import { Flexbox, Tooltip } from '@lobehub/ui';
import { Button, confirmModal, toast } from '@lobehub/ui/base-ui';
import { $getRoot } from 'lexical';
import { ChevronDownIcon, CircleStop, MessageCirclePlus } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AttachmentUploadButton } from '@/features/AttachmentInput';
import OpStatusTray from '@/features/Conversation/ChatInput/OpStatusTray';
import { useConversationResourceAccess } from '@/features/Conversation/hooks/useConversationResourceAccess';
import { useConversationStore } from '@/features/Conversation/store';
import { EditorCanvas } from '@/features/EditorCanvas';
import {
  getAttachmentFileIdsFromEditor,
  insertFilesIntoEditor,
} from '@/features/EditorCanvas/editorAttachments';
import { useEnterToSend } from '@/hooks/useEnterToSend';
import { useChatStore } from '@/store/chat';
import { useTaskStore } from '@/store/task';
import { taskActivitySelectors, taskDetailSelectors } from '@/store/task/selectors';

interface FeedbackInputProps {
  /** Acceptance's in-flow topic rail starts with the composer visible. The
      floating Topic drawer keeps its compact, opt-in default. */
  defaultExpanded?: boolean;
  /** Hide the collapse affordance when the hosting surface intentionally pins
      the composer open, as Acceptance's in-flow right rail does. */
  disableCollapse?: boolean;
}

const FeedbackInput = memo<FeedbackInputProps>(
  ({ defaultExpanded = false, disableCollapse = false }) => {
    const { t } = useTranslation('chat');
    const editor = useEditor();
    const sendMessage = useConversationStore((s) => s.sendMessage);
    const context = useConversationStore((s) => s.context);
    const activity = useTaskStore(taskActivitySelectors.activeDrawerTopicActivity);
    const activeTaskId = useTaskStore(taskDetailSelectors.activeTaskId);
    const drawerTaskId = useTaskStore((s) => s.activeTopicDrawerTaskId);
    const steerTopic = useTaskStore((s) => s.steerTopic);
    const cancelTopic = useTaskStore((s) => s.cancelTopic);
    const refreshMessages = useChatStore((s) => s.refreshMessages);
    const [submitting, setSubmitting] = useState(false);
    const [hasContent, setHasContent] = useState(false);
    const [hasAttachments, setHasAttachments] = useState(false);
    const [expanded, setExpanded] = useState(defaultExpanded);
    const shouldSendOnEnter = useEnterToSend();
    // Task follow-ups send into the shared agent's topic — view-only members
    // can watch the run but get no reply composer.
    const { canUseResource } = useConversationResourceAccess();

    // Steering applies to any task-owned topic: `task.steer` dispatches
    // server-side — inject for a live homogeneous run, interrupt+resume for a
    // heterogeneous one, continue for an idle topic. The drawer's topic counts
    // as task-owned once it resolves to a task activity, or when the opener
    // named the task (kanban "Open run"). A plain inbox topic keeps the
    // queue-style follow-up.
    const isTopicRunning = activity?.status === 'running';
    const isTaskTopic = !!activity || !!drawerTaskId;
    const steerTaskRef =
      activity?.sourceTaskIdentifier ?? activity?.sourceTaskId ?? drawerTaskId ?? activeTaskId;
    const canSteer = isTaskTopic && !!steerTaskRef && !!context.topicId;

    const canSubmit = hasContent || hasAttachments;

    useEffect(() => {
      if (expanded) editor?.focus?.();
    }, [expanded, editor]);

    const handleContentChange = useCallback(() => {
      const lexicalEditor = editor?.getLexicalEditor?.();
      if (!lexicalEditor) return;
      lexicalEditor.getEditorState().read(() => {
        const text = $getRoot().getTextContent().trim();
        setHasContent(text.length > 0);
      });
      setHasAttachments(getAttachmentFileIdsFromEditor(editor).length > 0);
    }, [editor]);

    const handleAttach = useCallback(
      (files: File[]) => {
        insertFilesIntoEditor(editor, files);
      },
      [editor],
    );

    const clearEditor = useCallback(() => {
      editor?.cleanDocument?.();
      setHasContent(false);
      setHasAttachments(false);
    }, [editor]);

    const handleStop = useCallback(() => {
      // The drawer's own topic is the run's topic — cancelTopic resolves it
      // server-side, so this stays correct even while the task detail
      // activity is still hydrating (activity?.id may lag).
      const topicId = context.topicId ?? activity?.id;
      if (!topicId) return;
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('taskDetail.topicMenu.stopConfirm.content', {
          defaultValue:
            'The current run will be canceled. Generated messages are kept and you can re-run the task later.',
        }),
        okText: t('taskDetail.topicMenu.stop', { defaultValue: 'Stop Run' }),
        onOk: async () => {
          await cancelTopic(topicId);
        },
        title: t('taskDetail.topicMenu.stopConfirm.title', { defaultValue: 'Stop Run?' }),
      });
    }, [activity?.id, cancelTopic, context.topicId, t]);

    const handleSubmit = useCallback(async () => {
      if (submitting) return;
      const editorData = editor?.getDocument?.('json') as Record<string, any> | undefined;
      const markdown = String(editor?.getDocument?.('markdown') ?? '').trim();
      const fileIds = getAttachmentFileIdsFromEditor(editor);
      if (!markdown && fileIds.length === 0) return;

      if (canSteer) {
        const topicId = context.topicId!;
        const taskRef = steerTaskRef!;
        // Keep the draft until the steer lands: a `requiresInterrupt` answer
        // means the run cannot consume a live message, so the user must
        // confirm tearing it down — and a declined confirm must not eat the
        // typed text.
        setSubmitting(true);
        try {
          const result = await steerTopic(taskRef, { fileIds, message: markdown, topicId });
          if (result.mode === 'requiresInterrupt') {
            confirmModal({
              cancelText: t('cancel', { ns: 'common' }),
              content: t('taskDetail.steerInterrupt.content'),
              okText: t('taskDetail.steerInterrupt.ok'),
              onOk: async () => {
                try {
                  await steerTopic(taskRef, {
                    fileIds,
                    interrupt: true,
                    message: markdown,
                    topicId,
                  });
                } catch {
                  toast.error(t('operationFailed', { ns: 'common' }));
                  return;
                }
                // Clear only after the confirmed steer landed — a failed
                // interrupt must not eat the typed text either.
                clearEditor();
                await refreshMessages({ agentId: context.agentId, topicId });
              },
              title: t('taskDetail.steerInterrupt.title'),
            });
            return;
          }
          clearEditor();
          await refreshMessages({ agentId: context.agentId, topicId });
        } catch {
          toast.error(t('operationFailed', { ns: 'common' }));
        } finally {
          setSubmitting(false);
        }
        return;
      }

      // Clear the editor synchronously BEFORE await so the input feels
      // responsive — sendMessage's optimistic-update pipeline keeps a copy
      // of the captured markdown / editorData for rendering. Keep the
      // ChatInput expanded after send: once the user has opened the reply
      // composer, treat it as the new resting state for this drawer session.
      clearEditor();

      setSubmitting(true);
      try {
        // sendMessage is bound to this drawer's ConversationProvider context
        // (agentId + topicId + isolatedTopic), so the message continues this
        // topic's conversation. Files attached inline in the editor travel as
        // part of editorData / markdown — no separate files array needed.
        // Force the gateway runtime so the follow-up runs on the same
        // server-side path as the original `runTask` that spawned this topic,
        // regardless of the user's global local/cloud preference.
        await sendMessage({ editorData, forceRuntime: 'gateway', message: markdown });
      } finally {
        setSubmitting(false);
      }
    }, [
      canSteer,
      clearEditor,
      context.agentId,
      context.topicId,
      editor,
      refreshMessages,
      sendMessage,
      steerTaskRef,
      steerTopic,
      submitting,
      t,
    ]);

    if (!canUseResource) return <OpStatusTray seamless />;

    // Surface the live running-op status flush above the reply affordance (seamless
    // inline row that renders nothing when idle), so the user can watch the agent
    // work without expanding the composer.
    if (!expanded) {
      return (
        <Flexbox gap={8}>
          <OpStatusTray seamless />
          <Button block icon={MessageCirclePlus} type={'fill'} onClick={() => setExpanded(true)}>
            {t('taskDetail.sendFollowUp')}
          </Button>
        </Flexbox>
      );
    }

    return (
      <Flexbox gap={8}>
        <OpStatusTray seamless />
        <ChatInput
          maxHeight={240}
          minHeight={64}
          footer={
            <ChatInputActionBar
              style={{ paddingInline: 8 }}
              left={
                <Flexbox horizontal align={'center'} gap={2}>
                  {!disableCollapse && (
                    <Button
                      icon={ChevronDownIcon}
                      size={'small'}
                      type={'text'}
                      onClick={() => setExpanded(false)}
                    >
                      {t('taskDetail.collapseReply')}
                    </Button>
                  )}
                  <AttachmentUploadButton onFiles={handleAttach} />
                </Flexbox>
              }
              right={
                <Flexbox horizontal align={'center'} gap={4}>
                  {isTopicRunning && (
                    <Tooltip title={t('taskDetail.topicMenu.stop', { defaultValue: 'Stop Run' })}>
                      <Button icon={CircleStop} size={'small'} type={'text'} onClick={handleStop} />
                    </Tooltip>
                  )}
                  <SendButton
                    disabled={!canSubmit && !submitting}
                    loading={submitting}
                    shape={'round'}
                    type={'primary'}
                    title={
                      canSteer ? t('taskDetail.steerPlaceholder') : t('taskDetail.replyInThread')
                    }
                    onClick={handleSubmit}
                  />
                </Flexbox>
              }
            />
          }
        >
          <EditorCanvas
            editor={editor}
            floatingToolbar={false}
            style={{ paddingBlock: 0 }}
            placeholder={
              canSteer ? t('taskDetail.steerPlaceholder') : t('taskDetail.replyPlaceholder')
            }
            onContentChange={handleContentChange}
            onPressEnter={({ event }) => {
              if (shouldSendOnEnter(event)) {
                handleSubmit();
                return true;
              }
            }}
          />
        </ChatInput>
      </Flexbox>
    );
  },
);

FeedbackInput.displayName = 'FeedbackInput';

export default FeedbackInput;
