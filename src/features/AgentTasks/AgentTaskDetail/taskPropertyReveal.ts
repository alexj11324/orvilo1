/**
 * Optional Issue properties ("+ Add property") the user opened while they are
 * still empty. The set belongs to ONE Issue: a peek pane keeps the same
 * component instance mounted while its `taskId` changes, so the set is tagged
 * with the Issue it was built for and discarded as soon as another Issue is
 * shown. Returning to an earlier Issue starts from nothing (not remembered),
 * matching a freshly opened Issue.
 */
export interface PropertyRevealState {
  readonly keys: ReadonlySet<string>;
  readonly taskId: string | undefined;
}

export const createPropertyRevealState = (taskId: string | undefined): PropertyRevealState => ({
  keys: new Set(),
  taskId,
});

/** The state for `taskId`: the same object when it already belongs to it, else a fresh empty one. */
export const reconcilePropertyReveal = (
  state: PropertyRevealState,
  taskId: string | undefined,
): PropertyRevealState => (state.taskId === taskId ? state : createPropertyRevealState(taskId));

export const revealProperty = (state: PropertyRevealState, key: string): PropertyRevealState => ({
  keys: new Set(state.keys).add(key),
  taskId: state.taskId,
});
