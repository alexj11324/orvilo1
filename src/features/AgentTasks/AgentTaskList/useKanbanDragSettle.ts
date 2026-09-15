import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * Content equality for the column map (`columnKey -> ordered task ids`). Two
 * maps are equal when their ordered column keys and each column's id list
 * match element-for-element.
 */
const columnsEqual = (a: Record<string, string[]>, b: Record<string, string[]>): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  if (aKeys.some((key, index) => key !== bKeys[index])) return false;
  for (const key of aKeys) {
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    if (!av || !bv || av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) {
      if (av[i] !== bv[i]) return false;
    }
  }
  return true;
};

/**
 * Drag/settle state machine for the kanban board.
 *
 * The board keeps a local column map mirroring the store's `taskGroups`
 * between drags. While dragging — or while a drop is *settling* (the move
 * mutation is in flight) — that mirror is frozen so an optimistic move isn't
 * clobbered by a refetch landing mid-flight. On settle the lock releases and
 * `settleVersion` bumps, forcing one resync from the reconciled groups.
 *
 * `initialColumns` is only read once (useState initializer); the caller drives
 * subsequent updates through its own resync effect + `setColumns`.
 */
export const useKanbanDragSettle = (initialColumns: () => Record<string, string[]>) => {
  const isDraggingRef = useRef(false);
  const isSettlingRef = useRef(false);
  // Throttles onDragOver: set true after a local move, cleared one frame later.
  const recentlyMovedRef = useRef(false);
  // Overlapping drops each hold one pending settle: the lock must outlive the
  // LAST release, not the first. `resyncOnRelease` OR-accumulates — a drop
  // keeping its optimistic placement releases with `resync: false`, but a
  // sibling's successful reconcile still resyncs the shared mirror.
  const pendingSettlesRef = useRef(0);
  const resyncOnReleaseRef = useRef(false);
  const [settleVersion, setSettleVersion] = useState(0);

  const [columns, setColumnsState] = useState<Record<string, string[]>>(initialColumns);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Equality-guarded column setter: a content-equal rebuild returns the SAME
  // reference so React bails out of the re-render, which keeps the resync
  // effect from spinning on per-render-unstable inputs.
  const setColumns = useCallback<Dispatch<SetStateAction<Record<string, string[]>>>>((update) => {
    setColumnsState((prev) => {
      const next =
        typeof update === 'function'
          ? (update as (p: Record<string, string[]>) => Record<string, string[]>)(prev)
          : update;
      return columnsEqual(prev, next) ? prev : next;
    });
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      recentlyMovedRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [columns]);

  /**
   * Engage the settle lock and return the callback that releases it. The lock
   * releases and a resync fires only after the LAST overlapping drop
   * releases; `release({ resync: false })` opts this drop out of the resync
   * (used when the optimistic placement stays in place pending a retry).
   */
  const beginSettle = useCallback(() => {
    pendingSettlesRef.current += 1;
    isSettlingRef.current = true;
    let released = false;
    return (options?: { resync?: boolean }) => {
      if (released) return;
      released = true;
      if (options?.resync !== false) resyncOnReleaseRef.current = true;
      pendingSettlesRef.current -= 1;
      if (pendingSettlesRef.current > 0) return;
      isSettlingRef.current = false;
      if (resyncOnReleaseRef.current) {
        resyncOnReleaseRef.current = false;
        setSettleVersion((v) => v + 1);
      }
    };
  }, []);

  return {
    beginSettle,
    columns,
    columnsRef,
    isDraggingRef,
    isSettlingRef,
    recentlyMovedRef,
    setColumns,
    settleVersion,
  };
};
