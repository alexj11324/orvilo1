import { useCallback, useEffect, useRef, useState } from 'react';

export const CLOSE_TOOL_DETAIL_POPOVER_EVENT = 'orvilo-tool-detail-popover-close';

const REOPEN_SUPPRESS_MS = 600;

export const closeToolDetailPopovers = () => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new Event(CLOSE_TOOL_DETAIL_POPOVER_EVENT));
};

/**
 * Hover-detail popovers of a skill row anchor to the same right edge as the row's
 * "..." policy menu, so an open detail card lands on top of the policy menu and
 * eats the click meant for it. `disabled` is the hard interlock the caller sets
 * while a policy menu is open; the event-driven suppression window only covers
 * the moment the menu opens, and a hover that starts after it expires would
 * otherwise reopen the card over the menu.
 */
export const useDetailPopoverState = (disabled?: boolean) => {
  const [open, setOpen] = useState(false);
  const suppressUntilRef = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleClose = () => {
      suppressUntilRef.current = Date.now() + REOPEN_SUPPRESS_MS;
      setOpen(false);
    };
    window.addEventListener(CLOSE_TOOL_DETAIL_POPOVER_EVENT, handleClose);

    return () => window.removeEventListener(CLOSE_TOOL_DETAIL_POPOVER_EVENT, handleClose);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Hover-only trigger: base-ui Trigger always wires useClick, so a press on a
  // hover-open (or opening) row would re-open with reason 'trigger-press' and
  // stick the card. Cancel press-driven opens to keep hover close semantics.
  const onOpenChange = useCallback(
    (nextOpen: boolean, eventDetails?: { cancel?: () => void; reason?: string }) => {
      if (nextOpen && eventDetails?.reason === 'trigger-press') {
        eventDetails.cancel?.();
        return;
      }
      if (nextOpen && (disabled || Date.now() < suppressUntilRef.current)) return;

      setOpen(nextOpen);
    },
    [disabled],
  );

  return { close, onOpenChange, open };
};
