'use client';

import { useEffect, useRef } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

// Open menus stack here so only the topmost one answers a digit — two menus
// each installing a document-level capture listener would otherwise race to
// apply the same keystroke.
const openMenuStack: symbol[] = [];

/**
 * A digit keydown counts as a menu accelerator only when it could not be
 * meant as text or as a chorded shortcut: modifier combos (⌘/Ctrl/Alt+1…9)
 * must reach the app hotkeys and the browser, an IME composition or a held
 * key must not mutate, an already-handled event must not be re-applied, and
 * digits typed inside an editable element — the menu's own autofocused
 * search input included — filter text instead of picking a row.
 */
export const isMenuDigitAcceleratorEvent = (event: KeyboardEvent): boolean => {
  if (!/^\d$/.test(event.key)) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing || event.repeat) return false;
  if (event.defaultPrevented) return false;
  const target = event.target;
  return !(
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input, textarea, select, [contenteditable], [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [role="slider"]',
      ))
  );
};

interface UseMenuDigitShortcutsOptions<T> {
  /** Pickable menu rows, in accelerator order — item `i` answers to digit `i + 1`. */
  items: readonly T[];
  /** Called with the row the digit selected; the menu closes itself afterwards. */
  onPick: (item: T) => void;
  /** Digit shortcuts bind the document only while the menu is open. */
  open: boolean;
}

/**
 * Unmodified digit accelerators for a search-filtered dropdown: `1`…`9`
 * pick the visible pickable rows without text-entry side effects. Reads
 * `items`/`onPick` through refs so the document listener installs once per
 * open and is removed on close.
 */
export const useMenuDigitShortcuts = <T>({
  items,
  onPick,
  open,
}: UseMenuDigitShortcutsOptions<T>): void => {
  const menuId = useSingleton(() => Symbol('menu-digit-accelerator'));
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!open) return;
    openMenuStack.push(menuId);
    const onKeyDown = (event: KeyboardEvent) => {
      if (openMenuStack.at(-1) !== menuId) return;
      if (!isMenuDigitAcceleratorEvent(event)) return;
      const idx = Number.parseInt(event.key, 10) - 1;
      const pickable = itemsRef.current;
      if (idx < 0 || idx >= pickable.length) return;
      event.preventDefault();
      // stopImmediatePropagation: listeners on the same node still run after
      // stopPropagation — a second open menu must not also see this digit.
      event.stopImmediatePropagation();
      onPickRef.current(pickable[idx]);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const idx = openMenuStack.lastIndexOf(menuId);
      if (idx >= 0) openMenuStack.splice(idx, 1);
    };
  }, [menuId, open]);
};
