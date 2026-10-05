import { ChatInput, Editor, SendButton, useEditor } from '@lobehub/editor/react';
import { cssVar } from 'antd-style';
import { ChevronLeft } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useEnterToSend } from '@/hooks/useEnterToSend';

interface CommentInputProps {
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}

const CommentInput = memo<CommentInputProps>(({ onSubmit, onCancel }) => {
  const { t } = useTranslation('home');
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
      maxHeight={100}
      minHeight={30}
      resize={false}
      footer={
        <div className="flex items-center gap-2 justify-between p-2">
          <Button
            disabled={submitting}
            size="sm"
            variant="ghost"
            style={{
              color: cssVar.colorTextDescription,
            }}
            onClick={onCancel}
          >
            <ChevronLeft data-icon="inline-start" />
            {t('cancel', { ns: 'common' })}
          </Button>
          <SendButton
            loading={submitting}
            shape={'round'}
            title={t('brief.commentSubmit')}
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
        placeholder={t('brief.commentPlaceholder')}
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

export default CommentInput;
