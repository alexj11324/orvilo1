export type SavedViewControl = 'display' | 'filters';

export const transitionSavedViewControl = (
  current: SavedViewControl | null,
  target: SavedViewControl,
  open: boolean,
): { next: SavedViewControl | null; resetDraft: boolean } => {
  if (!open) {
    return {
      next: current === target ? null : current,
      resetDraft: current === target,
    };
  }

  return {
    next: target,
    resetDraft: current !== null && current !== target,
  };
};
