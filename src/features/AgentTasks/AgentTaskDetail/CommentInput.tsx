import { SendButton, useEditor } from '@lobehub/editor/react';
import { isRecord } from '@orvilo/utils/object';
import { $getRoot } from 'lexical';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { AttachmentUploadButton } from '@/features/AttachmentInput';
import { mentionFilledClassName } from '@/features/ChatInput/InputEditor/mentionStyle';
import { EditorCanvas } from '@/features/EditorCanvas';
import {
  getAttachmentFileIdsFromEditor,
  insertFilesIntoEditor,
} from '@/features/EditorCanvas/editorAttachments';
import { useWorkspaceCommentMentionOption } from '@/features/Portal/TopicComments/useWorkspaceCommentMentionOption';
import { useEnterToSend } from '@/hooks/useEnterToSend';
import { usePermission } from '@/hooks/usePermission';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { parseMentionedAgentsFromEditorData } from '@/store/chat/slices/agentRun/actions/entries/commandBus/parseCommands';
import { useTaskStore } from '@/store/task';

import { styles } from '../shared/style';
import { useIssueInstructionTarget } from './useIssueInstructionTarget';
import { useTaskCommentDraft } from './useTaskCommentDraft';

const CommentInput = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const [searchParams] = useSearchParams();
  const { allowed: canEditTask } = usePermission('create_content');
  const editor = useEditor();
  const addComment = useTaskStore((s) => s.addComment);
  const runTask = useTaskStore((s) => s.runTask);
  const { target, error: targetError, mutate: reloadTarget } = useIssueInstructionTarget(taskId);
  const userAvatar = useUserAvatar();
  const [submitting, setSubmitting] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [hasAttachments, setHasAttachments] = useState(false);
  const [hasAgentMention, setHasAgentMention] = useState(false);
  const shouldSendOnEnter = useEnterToSend();
  // Same member source as document / topic comments, so `@` produces the
  // identical mention node the server resolves for notifications.
  const mentionOption = useWorkspaceCommentMentionOption(
    target ? [{ id: target.agentId, name: target.name, avatar: target.avatar }] : [],
  );
  const { clearAfterSend, onChange: saveDraft } = useTaskCommentDraft(
    taskId,
    editor,
    canEditTask,
    (content, hasFiles) => {
      setHasContent(!!content.trim());
      setHasAttachments(hasFiles);
      const snapshot = editor?.getDocument?.('json');
      setHasAgentMention(
        parseMentionedAgentsFromEditorData(isRecord(snapshot) ? snapshot : undefined).length > 0,
      );
      if (searchParams.get('draft') === '1') {
        document.getElementById('task-comment-composer')?.scrollIntoView({ block: 'center' });
        editor?.focus();
      }
    },
    () => toast.error(t('taskDetail.commentDraftSaveFailed')),
  );

  const canSubmit = hasContent || hasAttachments;

  const handleContentChange = useCallback(() => {
    const lexicalEditor = editor?.getLexicalEditor?.();
    if (!lexicalEditor) return;
    lexicalEditor.getEditorState().read(() => {
      const text = $getRoot().getTextContent().trim();
      setHasContent(text.length > 0);
    });
    setHasAttachments(getAttachmentFileIdsFromEditor(editor).length > 0);
    const snapshot = editor?.getDocument?.('json');
    setHasAgentMention(
      parseMentionedAgentsFromEditorData(isRecord(snapshot) ? snapshot : undefined).length > 0,
    );
    saveDraft();
  }, [editor, saveDraft]);

  const handleAttach = useCallback(
    (files: File[]) => {
      insertFilesIntoEditor(editor, files);
    },
    [editor],
  );

  const handleSubmit = useCallback(async () => {
    if (!canEditTask || submitting) return;
    const json = editor?.getDocument?.('json') as unknown;
    const markdown = String(editor?.getDocument?.('markdown') ?? '').trim();
    const hasFiles = getAttachmentFileIdsFromEditor(editor).length > 0;
    if (!markdown && !hasFiles) return;

    const mentioned = parseMentionedAgentsFromEditorData(isRecord(json) ? json : undefined);
    setSubmitting(true);
    try {
      try {
        if (mentioned.length > 0) {
          if (mentioned.length !== 1 || mentioned[0].id !== target?.agentId)
            throw new Error('The mentioned Agent is no longer available for this Issue');
          await runTask(
            taskId,
            {
              instructionAgentId: target.agentId,
              continueTopicId: target.topicId,
              prompt: markdown,
            },
            { throwOnError: true },
          );
        } else await addComment(taskId, markdown, { editorData: json });
      } catch (error) {
        // The draft stays in the editor so the user can retry. The store has
        // already rolled back the optimistic row; nothing else tells them.
        console.error('[CommentInput] addComment failed', error);
        toast.error(
          t(mentioned.length ? 'taskDetail.instructionSendFailed' : 'taskDetail.commentSendFailed'),
        );
        return;
      }
      editor?.cleanDocument?.();
      setHasContent(false);
      setHasAttachments(false);
      setHasAgentMention(false);
      await clearAfterSend();
    } finally {
      setSubmitting(false);
    }
  }, [canEditTask, taskId, editor, addComment, runTask, target, clearAfterSend, submitting, t]);

  return (
    <div className={`flex flex-col gap-1.5 ${styles.commentInputCard}`} id="task-comment-composer">
      {targetError && (
        <AsyncError error={targetError} variant="inline" onRetry={() => void reloadTarget()} />
      )}
      <div className="flex items-center gap-2" style={{ minWidth: 0, width: '100%' }}>
        <Avatar avatar={userAvatar} size={24} style={{ flexShrink: 0 }} />
        <div
          className={mentionFilledClassName}
          style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}
        >
          <EditorCanvas
            tabMovesFocus
            editor={editor}
            floatingToolbar={false}
            mentionOption={mentionOption}
            placeholder={t('taskDetail.commentPlaceholder')}
            style={{
              fontSize: 14,
              maxWidth: '100%',
              minHeight: 24,
              overflow: 'hidden',
              paddingBlock: 0,
              whiteSpace: 'normal',
            }}
            onContentChange={handleContentChange}
            onPressEnter={({ event }) => {
              if (!canEditTask) return true;
              if (shouldSendOnEnter(event)) {
                handleSubmit();
                return true;
              }
            }}
          />
        </div>
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <AttachmentUploadButton onFiles={handleAttach} />
          <SendButton
            aria-label={t(hasAgentMention ? 'taskDetail.sendFollowUp' : 'taskDetail.sendComment')}
            disabled={!canEditTask || (!canSubmit && !submitting)}
            loading={submitting}
            shape={'round'}
            title={t(hasAgentMention ? 'taskDetail.sendFollowUp' : 'taskDetail.sendComment')}
            type={'text'}
            onClick={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
});

export default CommentInput;
