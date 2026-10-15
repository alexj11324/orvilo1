import { CommandListenerPriority } from "lexical";
//#region src/types/hotkey.d.ts
declare const KeyEnum: {
  readonly Alt: "alt";
  readonly Backquote: "backquote";
  readonly Backslash: "backslash";
  readonly Backspace: "backspace";
  readonly BracketLeft: "bracketleft";
  readonly BracketRight: "bracketright";
  readonly Comma: "comma";
  readonly Ctrl: "ctrl";
  readonly Down: "down";
  readonly Enter: "enter";
  readonly Equal: "equal";
  readonly Esc: "esc";
  readonly Left: "left";
  readonly LeftClick: "left-click";
  readonly LeftDoubleClick: "left-double-click";
  readonly Meta: "meta";
  readonly MiddleClick: "middle-click";
  readonly Minus: "minus";
  readonly Mod: "mod";
  readonly Number: "1-9";
  readonly Period: "period";
  readonly Plus: "equal";
  readonly QuestionMark: "slash";
  readonly Quote: "quote";
  readonly Right: "right";
  readonly RightClick: "right-click";
  readonly RightDoubleClick: "right-double-click";
  readonly Semicolon: "semicolon";
  readonly Shift: "shift";
  readonly Slash: "slash";
  readonly Space: "space";
  readonly Tab: "tab";
  readonly Up: "up";
  readonly Zero: "0";
};
declare const HotkeyEnum: {
  readonly Bold: "bold";
  readonly BulletList: "bulletList";
  readonly CodeInline: "codeInline";
  readonly Italic: "italic";
  readonly Link: "link";
  readonly Mention: "mention";
  readonly NumberList: "numberList";
  readonly PasteAsPlainText: "pasteAsPlainText";
  readonly Redo: "redo";
  readonly Slash: "slash";
  readonly Strikethrough: "strikethrough";
  readonly Underline: "underline";
  readonly Undo: "undo";
};
declare const HotkeyScopeEnum: {
  readonly Format: "format";
  readonly Insert: "insert";
  readonly Plugin: "plugin";
  readonly Slash: "slash";
};
type HotkeyId = (typeof HotkeyEnum)[keyof typeof HotkeyEnum];
type HotkeyScopeId = (typeof HotkeyScopeEnum)[keyof typeof HotkeyScopeEnum];
interface HotkeyItem {
  id: HotkeyId;
  keys: string;
  priority: CommandListenerPriority;
  scopes?: HotkeyScopeId[];
}
type ModifierCombination = {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
} | Record<string, never>;
//#endregion
export { HotkeyEnum, HotkeyId, HotkeyItem, HotkeyScopeEnum, HotkeyScopeId, KeyEnum, ModifierCombination };