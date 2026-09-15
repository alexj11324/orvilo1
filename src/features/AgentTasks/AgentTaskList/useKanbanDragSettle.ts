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
   * Engage the settle lock and return the callback that releases it and
   * triggers a single resync from the (now reconciled) store groups.
   */
  const beginSettle = useCallback(() => {
    isSettlingRef.current = true;
    return () => {
      isSettlingRef.current = false;
      setSettleVersion((v) => v + 1);
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
