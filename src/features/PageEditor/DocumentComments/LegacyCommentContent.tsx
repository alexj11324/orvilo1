'use client';
import type { DocumentCommentItem } from '@orvilo/types';
import { memo } from 'react';

import { Markdown } from '@/components/Markdown';
import RichTextMessage from '@/features/Conversation/Messages/User/components/RichTextMessage';

import { styles } from './styles';

const hasDocumentCommentEditorData = (editorData: DocumentCommentItem['editorData']) =>
  Boolean(
    editorData &&
    typeof editorData === 'object' &&
    !Array.isArray(editorData) &&
    Object.keys(editorData).length > 0,
  );

const CommentContent = memo<Pick<DocumentCommentItem, 'content' | 'editorData'>>(
  ({ content, editorData }) => (
    <div className={styles.commentContent}>
      {hasDocumentCommentEditorData(editorData) ? (
        <RichTextMessage
          editorState={editorData}
          fontSize={14}
          lineHeight={22 / 14}
          variant={'default'}
        />
      ) : (
        <Markdown fontSize={14} lineHeight={22 / 14} variant={'chat'}>
          {content}
        </Markdown>
      )}
    </div>
  ),
);

CommentContent.displayName = 'DocumentCommentContent';

export default CommentContent;
