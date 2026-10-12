/**
 * Optional Issue properties ("+ Add property") the user opened while they are
 * still empty. The set belongs to ONE Issue: a peek pane keeps the same
 * component instance mounted while its `taskId` changes, so the set is tagged
 * with the Issue it was built for and discarded as soon as another Issue is
 * shown. Returning to an earlier Issue starts from nothing (not remembered),
 * matching a freshly opened Issue.
 *
 * Adding a property goes straight to choosing its value: `opening` names the
 * row whose picker opens as the row appears, so the user is never left looking
 * at an empty row they still have to click. The row itself stays for as long
 * as this Issue is shown, whether or not a value was chosen.
 */
export interface PropertyRevealState {
  readonly keys: ReadonlySet<string>;
  /** The most recently added property; its picker opens when its row mounts. */
  readonly opening: string | null;
  readonly taskId: string | undefined;
}

export const createPropertyRevealState = (taskId: string | undefined): PropertyRevealState => ({
  keys: new Set(),
  opening: null,
  taskId,
});

/** The state for `taskId`: the same object when it already belongs to it, else a fresh empty one. */
export const reconcilePropertyReveal = (
  state: PropertyRevealState,
  taskId: string | undefined,
): PropertyRevealState => (state.taskId === taskId ? state : createPropertyRevealState(taskId));

export const revealProperty = (state: PropertyRevealState, key: string): PropertyRevealState => ({
  keys: new Set(state.keys).add(key),
  opening: key,
  taskId: state.taskId,
});

/**
 * Once the added row is on screen its picker has opened; forgetting `opening`
 * keeps the picker from popping open again if the row is ever rebuilt (for
 * example when a run finishes and the field becomes editable again).
 */
export const settleOpening = (state: PropertyRevealState): PropertyRevealState =>
  state.opening === null ? state : { ...state, opening: null };

/**
 * Properties whose value is chosen in a dialog. Adding one opens the dialog
 * and reveals no row: with nothing chosen there is nothing to show, and the
 * property stays available in the add menu.
 */
const DIALOG_PROPERTIES: ReadonlySet<string> = new Set(['dueDate']);

export const addsWithoutRow = (key: string): boolean => DIALOG_PROPERTIES.has(key);
