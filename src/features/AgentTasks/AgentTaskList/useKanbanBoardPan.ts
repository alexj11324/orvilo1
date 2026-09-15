import { useCallback, useEffect, useRef } from 'react';

/** Threshold (px) that distinguishes a click from a pan drag. Mirrors the
 * board's dnd-kit PointerSensor `activationConstraint: { distance: 5 }` so a
 * blank-area press and a card press feel identical up to the moment one is
 * recognized as a drag. */
const PAN_ACTIVATION_DISTANCE = 5;

// Elements whose press must NOT start a board pan — they own their own pointer
// semantics (dnd-kit cards, links, form controls, menus). A gesture starting
// anywhere inside one of these is left untouched.
const INTERACTIVE_SELECTOR = [
  '[data-board-card]',
  '[data-no-board-pan]',
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='tab']",
  "[role='switch']",
  "[contenteditable='true']",
].join(', ');

/**
 * Blank-area left-drag panning for the horizontally scrollable board
 * (Trello/Linear pattern): pressing the LEFT mouse button on empty board
 * background and dragging pans the board horizontally. Dragging a card still
 * moves the card (dnd-kit); this hook stays out of the way because it never
 * activates when the gesture starts on a card or any interactive element.
 * Touch and pen input are intentionally left to the browser.
 *
 * ### dnd-kit coexistence invariant (do not break)
 * These pointer handlers sit on the SAME scroll container that hosts the
 * `DndContext`. They are mutually exclusive with card dragging purely by
 * ORIGIN: `onPointerDown` bails whenever the press starts inside
 * `INTERACTIVE_SELECTOR`, and every sortable card root carries
 * `data-board-card` (see `KanbanColumn`). If that attribute is removed from
 * the card root, card drags and board pans will start fighting.
 *
 * Returns props to spread onto the scroll container.
 */
export const useKanbanBoardPan = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  // Pointer id of the active/pending gesture, or null when idle.
  const pointerIdRef = useRef<number | null>(null);
  // True once the ~5px threshold is crossed and we are actually panning.
  const activeRef = useRef(false);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);

  const beginSelectionSuppression = useCallback((el: T) => {
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
  }, []);

  const reset = useCallback(() => {
    const el = ref.current;
    if (el && pointerIdRef.current !== null) {
      // releasePointerCapture throws if the capture was already lost; ignore.
      try {
        el.releasePointerCapture(pointerIdRef.current);
      } catch {
        /* capture already released */
      }
    }
    pointerIdRef.current = null;
    activeRef.current = false;
    if (el) {
      el.style.removeProperty('cursor');
      // Restore text selection once the gesture ends.
      el.style.removeProperty('user-select');
      el.style.removeProperty('-webkit-user-select');
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<T>) => {
      // Left mouse button only. Primary touch/pen also report button === 0,
      // but this gesture is intentionally scoped to mouse input.
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const el = ref.current;
      if (!el) return;
      // Ignore gestures that begin on a card or interactive control — those
      // belong to dnd-kit / links / form fields (see coexistence invariant).
      const target = event.target as Element | null;
      if (target && target.closest(INTERACTIVE_SELECTOR)) return;

      pointerIdRef.current = event.pointerId;
      activeRef.current = false;
      startXRef.current = event.clientX;
      lastXRef.current = event.clientX;

      // Suppress text selection from the very first event, before the 5px
      // threshold, so no selection can begin and auto-scroll the container.
      beginSelectionSuppression(el);

      // Claim the pointer immediately so subsequent moves keep coming to this
      // element even once the cursor leaves the board.
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture unsupported/rejected. The gesture still works:
        // pointer events keep flowing to the container while the button is
        // held, and the window `blur` + `buttons` checks guarantee cleanup.
      }
      event.preventDefault();
    },
    [beginSelectionSuppression],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) return;
      const el = ref.current;
      if (!el) return;

      // The primary button was released somewhere we didn't hear about.
      if ((event.buttons & 1) === 0) {
        reset();
        return;
      }

      if (!activeRef.current) {
        if (Math.abs(event.clientX - startXRef.current) < PAN_ACTIVATION_DISTANCE) return;
        activeRef.current = true;
        el.style.cursor = 'grabbing';
      }

      // Horizontal axis only, driven by captured-pointer clientX deltas.
      const delta = event.clientX - lastXRef.current;
      lastXRef.current = event.clientX;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const next = Math.min(Math.max(el.scrollLeft - delta, 0), Math.max(maxScroll, 0));
      el.scrollLeft = next;
      event.preventDefault();
    },
    [reset],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<T>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      reset();
    },
    [reset],
  );

  // Selection/native-drag blockers while a gesture is pending or active —
  // `user-select` covers most engines, but Safari and Firefox can still start
  // a selection or an image/text drag, so veto the events outright.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const veto = (event: Event) => {
      if (pointerIdRef.current !== null) event.preventDefault();
    };
    el.addEventListener('selectstart', veto);
    el.addEventListener('dragstart', veto);
    return () => {
      el.removeEventListener('selectstart', veto);
      el.removeEventListener('dragstart', veto);
    };
  }, []);

  useEffect(() => {
    const handleBlur = () => reset();
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [reset]);

  return {
    onLostPointerCapture: onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    ref,
  };
};
