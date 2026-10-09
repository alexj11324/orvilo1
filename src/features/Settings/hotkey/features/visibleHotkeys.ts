import { type HotkeyGroupId, type HotkeyId, type HotkeyItem } from '@/types/hotkey';

import { desktopHotkeyDisplay } from './desktopHotkeyDisplay';

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
 *
 * `external` holds bindings from the other settings surface (the Electron
 * global shortcuts live in a separate store with its own ids, e.g. `showApp`
 * exists on both sides), so they are matched by key combination only.
 */
export const getHotkeyConflicts = (
  stored: Readonly<Record<string, string | undefined>>,
  selfId: HotkeyId | undefined,
  registration: readonly HotkeyItem[],
  external: readonly (string | undefined)[] = [],
): string[] => {
  const registered = new Set<string>(registration.map((item) => item.id));
  const inApp = Object.entries(stored).flatMap(([id, keys]) =>
    id !== selfId && registered.has(id) && keys ? [keys] : [],
  );
  return [...inApp, ...external.filter((keys): keys is string => !!keys)];
};

/** Validate changes at the save boundary, including resets that HotkeyInput emits unchecked. */
export const getHotkeyChangeConflict = (
  changes: Readonly<Record<string, string | undefined>>,
  stored: Readonly<Record<string, string | undefined>>,
  registration: readonly HotkeyItem[],
  external: readonly (string | undefined)[] = [],
): HotkeyId | undefined => {
  const next = { ...stored, ...changes };
  return registration.find(({ id }) => {
    const keys = changes[id];
    return keys && getHotkeyConflicts(next, id, registration, external).includes(keys);
  })?.id;
};

/** Electron global shortcuts as HotkeyInput key strings, skipping `exceptId` and empty bindings. */
export const getDesktopBindingKeys = (
  desktopBindings: Readonly<Record<string, string | undefined>>,
  exceptId?: string,
): string[] =>
  Object.entries(desktopBindings).flatMap(([id, accelerator]) => {
    const keys = id !== exceptId && accelerator ? desktopHotkeyDisplay(accelerator) : '';
    return keys ? [keys] : [];
  });

/** Conflicts for an Electron global shortcut row: other global shortcuts plus every in-app binding. */
export const getDesktopHotkeyConflicts = (
  desktopBindings: Readonly<Record<string, string | undefined>>,
  selfId: string,
  stored: Readonly<Record<string, string | undefined>>,
  registration: readonly HotkeyItem[],
): string[] =>
  getHotkeyConflicts(
    stored,
    undefined,
    registration,
    getDesktopBindingKeys(desktopBindings, selfId),
  );
