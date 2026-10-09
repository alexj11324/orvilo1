/**
 * Run a save that has already been reflected optimistically in the UI.
 * When it rejects, restore the previous value and report the failure so the
 * control never keeps showing a value that was not stored.
 *
 * @returns whether the save succeeded
 */
export const runWithRollback = async (
  commit: () => Promise<unknown>,
  rollback: () => void,
  onError: (error: unknown) => void,
): Promise<boolean> => {
  try {
    await commit();
    return true;
  } catch (error) {
    rollback();
    onError(error);
    return false;
  }
};
