'use client';

import { ChatInput, ChatInputActionBar, useEditor } from '@lobehub/editor/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { TypoBar } from '@/features/EditorCanvas';
import {
  insertExistingAttachmentsIntoEditor,
  insertFilesIntoEditor,
} from '@/features/EditorCanvas/editorAttachments';
import { readTopicCommentEditorValue } from '@/features/Portal/TopicComments/editorUtils';

import LegacyCommentEditor from './DocumentCommentEditor';
import {
  type CommentEditorHandle,
  type DocumentCommentEditorKit,
  DocumentCommentEditorKitProvider,
} from './editorKit';
import LegacyCommentContent from './LegacyCommentContent';

const legacyKit: DocumentCommentEditorKit = {
  PublishedContent: LegacyCommentContent,
  Input: ChatInput,
  ActionBar: ChatInputActionBar,
  useEditor() {
    const editor = useEditor();
    return useMemo<CommentEditorHandle>(
      () => ({
        cleanDocument: () => editor.cleanDocument(),
        focus: () => editor.focus(),
        getValue: () => readTopicCommentEditorValue(editor),
        setValue: (value) => {
          if (value.editorData) editor.setDocument('json', value.editorData);
          else editor.setDocument('markdown', value.content);
        },
        insertFiles: (files) => insertFilesIntoEditor(editor, files),
        insertExisting: (files) => insertExistingAttachmentsIntoEditor(editor, files),
        renderEditor: (props) => <LegacyCommentEditor {...props} editor={editor} />,
        renderFormattingToolbar: () => <TypoBar editor={editor} />,
      }),
      [editor],
    );
  },
};
export function LegacyDocumentCommentEditorProvider({ children }: { children: ReactNode }) {
  return (
    <DocumentCommentEditorKitProvider kit={legacyKit}>{children}</DocumentCommentEditorKitProvider>
  );
}
