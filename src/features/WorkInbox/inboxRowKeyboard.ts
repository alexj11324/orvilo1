interface ActivationKeyEvent {
  currentTarget: EventTarget | null;
  key: string;
  preventDefault: () => void;
  target: EventTarget | null;
}

/**
 * Row-level Enter/Space activation for `role="button"` inbox rows. Only fires
 * when the row itself holds focus — keydown bubbling from the revealed action
 * buttons (read/archive/snooze) or portaled menu items must not steal the key:
 * on Enter, row `preventDefault` would suppress the button's own activation.
 */
export const inboxRowSelectKeyDown = (event: ActivationKeyEvent, selectRow: () => void): void => {
  if (event.target !== event.currentTarget) return;
  if ((event.target as HTMLElement | null)?.closest?.('[role="menu"]')) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectRow();
  }
};
