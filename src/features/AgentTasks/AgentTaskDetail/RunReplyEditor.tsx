import { ChatInput, Editor, SendButton, useEditor } from '@lobehub/editor/react';
import { cssVar } from 'antd-style';
import { ChevronLeft } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useEnterToSend } from '@/hooks/useEnterToSend';

interface RunReplyEditorProps {
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void> | void;
  placeholder?: string;
}

/**
 * Compact inline reply editor for a task run — the Brief-card style (a
 * button + a small ChatInput with cancel/send), popped in place beneath the
 * run's message rather than opening a separate conversation window.
 */
const RunReplyEditor = memo<RunReplyEditorProps>(({ onSubmit, onCancel, placeholder }) => {
  const { t } = useTranslation('chat');
  const editor = useEditor();
  const [submitting, setSubmitting] = useState(false);
  const shouldSendOnEnter = useEnterToSend();

  const handleSubmit = useCallback(async () => {
    const content = String(editor?.getDocument?.('markdown') ?? '').trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content);
    } finally {
      setSubmitting(false);
    }
  }, [editor, onSubmit, submitting]);

  return (
    <ChatInput
      gap={8}
      maxHeight={120}
      minHeight={30}
      resize={false}
      footer={
        <div className="flex items-center justify-between gap-2 p-2">
          <Button
            disabled={submitting}
            size="sm"
            style={{ color: cssVar.colorTextDescription }}
            variant="ghost"
            onClick={onCancel}
          >
            {<ChevronLeft size={14} />}
            {t('cancel', { ns: 'common' })}
          </Button>
          <SendButton
            loading={submitting}
            shape={'round'}
            title={t('taskDetail.runFollowUp')}
            type={'primary'}
            onClick={handleSubmit}
          />
        </div>
      }
    >
      <Editor
        content={''}
        editor={editor}
        enablePasteMarkdown={false}
        markdownOption={false}
        placeholder={placeholder ?? t('taskDetail.runFollowUpPlaceholder')}
        type={'text'}
        variant={'chat'}
        onPressEnter={({ event }) => {
          if (shouldSendOnEnter(event)) {
            handleSubmit();
            return true;
          }
        }}
      />
    </ChatInput>
  );
});

export default RunReplyEditor;
