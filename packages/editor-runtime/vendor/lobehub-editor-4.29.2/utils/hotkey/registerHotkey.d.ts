import { HotkeyId, HotkeyItem, ModifierCombination } from "../../types/hotkey.js";
//#region src/utils/hotkey/registerHotkey.d.ts
type HotkeysEvent = {
  key?: string;
  keys: string;
  modifiers: ModifierCombination;
  scopes?: string[];
};
type HotkeyOptions = {
  enabled?: boolean;
  preventDefault?: boolean;
  stopImmediatePropagation?: boolean;
  stopPropagation?: boolean;
};
declare const getHotkeyById: (id: HotkeyId) => HotkeyItem;
//#endregion
export { HotkeyOptions, HotkeysEvent, getHotkeyById };