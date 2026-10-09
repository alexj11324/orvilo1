import type { IEditor } from '@lobehub/editor';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_TAB_COMMAND,
  type LexicalEditor,
} from 'lexical';

/**
 * Whether Tab should hand focus to the next / previous control. A bare Tab or
 * Shift+Tab does, except inside a list item where Tab indents. A modified Tab
 * (Ctrl / Alt / Meta) is the browser's or OS's own shortcut: left alone.
 */
export const tabLeavesEditor = (
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>,
  inListItem: boolean,
): boolean => !inListItem && !event.altKey && !event.ctrlKey && !event.metaKey;

/**
 * The list plugin claims Tab at editor priority (`preventDefault` + indent or
 * insert a tab character), which traps keyboard focus in a composer. Claim it
 * one level up and answer `true` WITHOUT `preventDefault`: Lexical stops
 * dispatching, the browser then moves focus natively.
 */
export const registerTabFocusEscapeOnLexical = (lexicalEditor: LexicalEditor): (() => void) =>
  lexicalEditor.registerCommand(
    KEY_TAB_COMMAND,
    (event) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      const anchor = selection.anchor.getNode();
      const inListItem = [anchor, ...anchor.getParents()].some(
        (node) => node.getType() === 'listitem',
      );
      return tabLeavesEditor(event, inListItem);
    },
    COMMAND_PRIORITY_HIGH,
  );

export const registerTabFocusEscape = (editor: IEditor): (() => void) | undefined => {
  const lexicalEditor = editor.getLexicalEditor?.();
  if (!lexicalEditor) return;
  return registerTabFocusEscapeOnLexical(lexicalEditor);
};
