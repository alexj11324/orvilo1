import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_CODEMIRROR_COMMAND,
  INSERT_HEADING_COMMAND,
  INSERT_HORIZONTAL_RULE_COMMAND,
  INSERT_IMAGE_COMMAND,
  INSERT_MATH_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_TABLE_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from 'lexical';

export type NativeSlashChoice =
  'h1' | 'h2' | 'h3' | 'tl' | 'ul' | 'ol' | 'image' | 'hr' | 'table' | 'codeblock' | 'tex';
export interface NativeSlashMatch {
  end: number;
  key: string;
  query: string;
  start: number;
  text: string;
}
export const nativeSlashKeys: readonly NativeSlashChoice[] = [
  'h1',
  'h2',
  'h3',
  'tl',
  'ul',
  'ol',
  'image',
  'hr',
  'table',
  'codeblock',
  'tex',
];

/** Same simple-text/word-boundary/75-character contract as the original slash owner. */
export function matchNativeSlash(
  text: string,
  end: number,
): Omit<NativeSlashMatch, 'key'> | undefined {
  const prefix = text.slice(0, end);
  const match = /(^|[\s(])\/([^/\s.,+*?$@|#{}()^[\]\\!%'"~=<>_:;]{0,75})$/.exec(prefix);
  if (!match) return;
  return { start: match.index + match[1].length, end, query: match[2], text };
}

/** Call only in the actual editor read/update scope. */
export function readNativeSlash(): NativeSlashMatch | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text')
    return;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || !node.isSimpleText()) return;
  const match = matchNativeSlash(node.getTextContent(), selection.anchor.offset);
  return match ? { ...match, key: node.getKey() } : undefined;
}
export function sameNativeSlash(
  a: NativeSlashMatch | undefined,
  b: NativeSlashMatch | undefined,
): boolean {
  return (
    !!a && !!b && a.key === b.key && a.start === b.start && a.end === b.end && a.text === b.text
  );
}
export function ownsNativeSlash(editor: LexicalEditor, expected: NativeSlashMatch): boolean {
  return (
    editor.isEditable() &&
    !editor.isComposing() &&
    editor.getEditorState().read(() => sameNativeSlash(readNativeSlash(), expected))
  );
}

/** One discrete actual command transaction. Picker cancellation never calls it.
 * A missing handler restores the exact original state, including the slash text. */
export function applyNativeSlashChoice(
  editor: LexicalEditor,
  match: NativeSlashMatch,
  choice: NativeSlashChoice,
  file?: File,
): boolean {
  if (
    !ownsNativeSlash(editor, match) ||
    (choice === 'image' && (!file || !file.type.startsWith('image/')))
  )
    return false;
  const before = editor.getEditorState();
  let accepted = false;
  try {
    editor.update(
      () => {
        if (!sameNativeSlash(readNativeSlash(), match)) return;
        const selection = $getSelection();
        const node = $getNodeByKey(match.key);
        if (!$isRangeSelection(selection) || !$isTextNode(node)) return;
        selection.setTextNodeRange(node, match.start, node, match.end);
        selection.insertText('');
        switch (choice) {
          case 'h1':
          case 'h2':
          case 'h3': {
            accepted = editor.dispatchCommand(INSERT_HEADING_COMMAND, { tag: choice });
            break;
          }
          case 'tl': {
            accepted = editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
            break;
          }
          case 'ul': {
            accepted = editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            break;
          }
          case 'ol': {
            accepted = editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            break;
          }
          case 'image': {
            if (file) accepted = editor.dispatchCommand(INSERT_IMAGE_COMMAND, { file });
            break;
          }
          case 'hr': {
            accepted = editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, {});
            break;
          }
          case 'table': {
            accepted = editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3' });
            break;
          }
          case 'codeblock': {
            accepted = editor.dispatchCommand(INSERT_CODEMIRROR_COMMAND, undefined);
            break;
          }
          case 'tex': {
            accepted = editor.dispatchCommand(INSERT_MATH_COMMAND, { code: 'x^2 + y^2 = z^2' });
            break;
          }
        }
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
  } catch (error) {
    editor.setEditorState(before);
    throw error;
  }
  if (!accepted) editor.setEditorState(before);
  return accepted;
}
