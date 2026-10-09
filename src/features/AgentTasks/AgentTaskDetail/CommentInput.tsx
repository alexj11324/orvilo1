import { SendButton, useEditor } from '@lobehub/editor/react';
import { $getRoot } from 'lexical';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

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
import { useTaskStore } from '@/store/task';

import { styles } from '../shared/style';
import { useTaskCommentDraft } from './useTaskCommentDraft';

const CommentInput = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const [searchParams] = useSearchParams();
  const { allowed: canEditTask } = usePermission('create_content');
  const editor = useEditor();
  const addComment = useTaskStore((s) => s.addComment);
  const userAvatar = useUserAvatar();
  const [submitting, setSubmitting] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [hasAttachments, setHasAttachments] = useState(false);
  const shouldSendOnEnter = useEnterToSend();
  // Same member source as document / topic comments, so `@` produces the
  // identical mention node the server resolves for notifications.
  const mentionOption = useWorkspaceCommentMentionOption();
  const { clearAfterSend, onChange: saveDraft } = useTaskCommentDraft(
    taskId,
    editor,
    canEditTask,
    (content, hasFiles) => {
      setHasContent(!!content.trim());
      setHasAttachments(hasFiles);
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

    setSubmitting(true);
    try {
      try {
        await addComment(taskId, markdown, { editorData: json });
      } catch (error) {
        // The draft stays in the editor so the user can retry. The store has
        // already rolled back the optimistic row; nothing else tells them.
        console.error('[CommentInput] addComment failed', error);
        toast.error(t('taskDetail.commentSendFailed'));
        return;
      }
      editor?.cleanDocument?.();
      setHasContent(false);
      setHasAttachments(false);
      await clearAfterSend();
    } finally {
      setSubmitting(false);
    }
  }, [canEditTask, taskId, editor, addComment, clearAfterSend, submitting, t]);

  return (
    <div className={`flex flex-col gap-1.5 ${styles.commentInputCard}`} id="task-comment-composer">
      <div className="flex items-center gap-2" style={{ minWidth: 0, width: '100%' }}>
        <Avatar avatar={userAvatar} size={24} style={{ flexShrink: 0 }} />
        <div
          className={mentionFilledClassName}
          style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}
        >
          <EditorCanvas
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
            disabled={!canEditTask || (!canSubmit && !submitting)}
            loading={submitting}
            shape={'round'}
            type={'text'}
            onClick={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
});

export default CommentInput;
