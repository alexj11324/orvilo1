# Inbox "Snooze > Custom" picker

Symptom: in the Inbox, row hover menu `Snooze > Custom` opened no dialog with a real mouse, and
once the click selected the row underneath.

Root cause: the row action cluster was `hidden group-hover:flex group-focus-within:flex`. The
dropdown popup is portaled to `body`, so as soon as the pointer or focus enters the popup the row
no longer matches `:hover` / `:focus-within`. The cluster went back to `display: none`, the trigger's
rect collapsed to 0x0 and the popup was repositioned away from the cursor; the next mouse-up landed
on the row (`onSelect`) instead of the menu item. The earlier attempt (deferring the dialog to
`onOpenChangeComplete`) targeted the wrong boundary.

Fix:

- The cluster stays visible while a menu is open: `has-data-popup-open:flex` (Base UI marks the open
  trigger with `data-popup-open`; same idea as `HomeSidebar/SectionHeader`).
- `Custom` calls `onCustomSnooze(card)` directly from the item click, like the Issue header menu's
  `Custom` due date / reminder entries (`useTaskIssueDates`). The modal is imperative
  (`createModal`, rendered by `ModalHost`), so it does not depend on the menu staying mounted.
- The picker resolves date + time through the pure `resolveCustomSnoozeUntil` (rejects a missing
  date, malformed time, or a moment that is not in the future), and the confirm button is disabled
  while it returns `null`.

Not verified here: no Electron run was done by the author; the cause is derived from the markup and
Base UI behaviour, to be confirmed on the real app.
