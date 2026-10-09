import { type HotkeyGroupId, type HotkeyId, type HotkeyItem } from '@/types/hotkey';

/**
 * Shortcuts whose handlers only exist in the Electron shell (the tab bar and
 * the terminal panel). Listing them on the Web would offer keys that do nothing.
 */
export const DESKTOP_ONLY_HOTKEY_IDS: ReadonlySet<HotkeyId> = new Set<HotkeyId>([
  'switchTab',
  'nextTab',
  'prevTab',
  'toggleTerminalPanel',
]);

export const getVisibleHotkeys = (
  registration: readonly HotkeyItem[],
  group: HotkeyGroupId,
  desktop: boolean,
): HotkeyItem[] =>
  registration.filter(
    (item) => item.group === group && (desktop || !DESKTOP_ONLY_HOTKEY_IDS.has(item.id)),
  );

/**
 * Key combinations already bound by other shortcuts. Stored settings can still
 * carry ids that were retired from the registry (their rows are gone), so only
 * registered ids count — otherwise a stale binding would block a combination
 * with no row left to clear it from.
 */
export const getHotkeyConflicts = (
  stored: Readonly<Record<string, string | undefined>>,
  selfId: HotkeyId,
  registration: readonly HotkeyItem[],
): string[] => {
  const registered = new Set<string>(registration.map((item) => item.id));
  return Object.entries(stored).flatMap(([id, keys]) =>
    id !== selfId && registered.has(id) && keys ? [keys] : [],
  );
};
