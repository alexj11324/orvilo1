import type { IEditor, ISlashMenuOption } from '@lobehub/editor';
import { INSERT_MENTION_COMMAND } from '@lobehub/editor';
import type { TopicCommentJson } from '@orvilo/types';
import { $getSelection, $isRangeSelection } from 'lexical';

export type { MentionableWorkspaceMember } from './mentionData';
export { createTopicCommentMentionItems, writeTopicCommentMentionMarkdown } from './mentionData';

export interface TopicCommentEditorValue {
  content: string;
  editorData: TopicCommentJson;
}

export const createTopicCommentMentionPayload = (option: ISlashMenuOption) => ({
  label: String(option.label),
  metadata: option.metadata,
});

export const insertTopicCommentMention = (editor: IEditor, option: ISlashMenuOption) => {
  editor.dispatchCommand(INSERT_MENTION_COMMAND, createTopicCommentMentionPayload(option));

  editor.getLexicalEditor()?.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    // An inline decorator at the end of a paragraph has no DOM text position for the caret.
    // Keep a trailing text node selected so typing can continue immediately after the mention.
    selection.insertText(' ');
  });
  editor.focus();
};

export const readTopicCommentEditorValue = (editor: IEditor): TopicCommentEditorValue => {
  const editorData = editor.getDocument('json') ?? null;

  return {
    content: String(editor.getDocument('markdown') ?? ''),
    // Lexical nodes can expose optional properties with an `undefined` value
    // (for example a FileNode without message/size). tRPC and PostgreSQL accept
    // JSON values only, so normalize the editor snapshot at this shared
    // boundary before comments are drafted or submitted.
    // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves undefined properties.
    editorData: JSON.parse(JSON.stringify(editorData)) as TopicCommentJson,
  };
};

export const resolveTopicCommentEditorContent = (
  initialContent: string,
  initialEditorData?: TopicCommentJson | null,
) => ({
  content: initialEditorData ?? initialContent,
  type: initialEditorData
    ? ('json' as const)
    : initialContent
      ? ('markdown' as const)
      : ('text' as const),
});
