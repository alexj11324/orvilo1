import type { IEditor } from '@lobehub/editor';
import { HISTORY_PUSH_TAG } from 'lexical';

/** Commit the user review before any persistence snapshot reads the document. */
export const commitEditorReview = async (
  editor: IEditor,
  mutate: () => void,
  persist: () => Promise<void>,
): Promise<boolean> => {
  const lexicalEditor = editor.getLexicalEditor();
  if (!lexicalEditor || !lexicalEditor.isEditable()) return false;

  lexicalEditor.update(mutate, { discrete: true, tag: HISTORY_PUSH_TAG });
  await persist();
  return true;
};
