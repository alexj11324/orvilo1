import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { MessageContent as AIMessageContent } from '@/components/ai-elements/message';
import type { ModalInstance } from '@/components/Modal';
import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
} from '@/features/Conversation/store';
import { openEditorModal } from '@/features/EditorModal';
import { usePermission } from '@/hooks/usePermission';

import { type ChatItemProps } from '../../type';

export const MSG_CONTENT_CLASSNAME = 'msg_content_flag';

export interface MessageContentProps {
  children?: ReactNode;
  className?: string;
  disabled?: ChatItemProps['disabled'];
  editing?: ChatItemProps['editing'];
  id: string;
  message?: ReactNode;
  messageExtra?: ChatItemProps['messageExtra'];
  onDoubleClick?: ChatItemProps['onDoubleClick'];
}

const MessageContent = memo<MessageContentProps>(
  ({ editing, id, message, messageExtra, children, onDoubleClick, disabled, className }) => {
    const [toggleMessageEditing, updateMessageContent, regenerateUserMessage] =
      useConversationStore((s) => [
        s.toggleMessageEditing,
        s.updateMessageContent,
        s.regenerateUserMessage,
      ]);

    const editorData = useConversationStore(
      (s) => dataSelectors.getDisplayMessageById(id)(s)?.editorData,
    );

    // Short-circuit on non-editing rows so streaming token updates stay O(1) per row
    // instead of each row running `findLast` on displayMessages (O(N²) per update).
    // Use isInputLoading (covers sendMessage + AI runtime) rather than isAIGenerating,
    // otherwise the initial send phase — where the persisted id has just swapped in
    // under an optimistic tmp_* op — would flip to Send and kick off a duplicate
    // regenerate for the same prompt.
    const shouldSendOnConfirm = useConversationStore((s) => {
      if (!editing) return false;
      if (dataSelectors.getDisplayMessageById(id)(s)?.role !== 'user') return false;
      if (s.displayMessages.findLast((m) => m.role === 'user')?.id !== id) return false;
      return !messageStateSelectors.isInputLoading(s);
    });

    const { t } = useTranslation('common');
    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');

    const onEditingChange = useCallback(
      (edit: boolean) => {
        if (!canEdit && edit) return;
        toggleMessageEditing(id, edit);
      },
      [canEdit, id, toggleMessageEditing],
    );

    // Held in a ref rather than in the effect's deps: the editor snapshots the
    // message when it opens, so a re-render (a streaming token, a permission
    // refresh) must not tear down and reopen a modal the user is typing in.
    const openEditorRef = useRef<() => ModalInstance>(undefined);
    openEditorRef.current = () =>
      openEditorModal({
        editorData,
        okText: shouldSendOnConfirm ? t('send') : t('save'),
        value: message ? String(message) : '',
        onClose: () => onEditingChange(false),
        onConfirm: async (value, newEditorData) => {
          if (!canEdit) return;
          onEditingChange(false);
          // updateMessageContent does an optimistic state update synchronously before
          // awaiting the DB round trip. Kick off regenerate in parallel so the old
          // assistant reply is replaced by switchMessageBranch without waiting for persistence.
          const save = updateMessageContent(id, value, {
            editorData: newEditorData as Record<string, any> | undefined,
          });
          if (canCreate && shouldSendOnConfirm) {
            await regenerateUserMessage(id);
          }
          await save;
        },
      });

    useEffect(() => {
      if (!editing) return;
      const instance = openEditorRef.current!();
      return () => instance.close();
    }, [editing]);

    return (
      <AIMessageContent
        className={cn(
          MSG_CONTENT_CLASSNAME,
          disabled && 'select-none text-muted-foreground',
          className,
        )}
        onDoubleClick={onDoubleClick}
      >
        {children || message}
        {messageExtra}
      </AIMessageContent>
    );
  },
);

export default MessageContent;
