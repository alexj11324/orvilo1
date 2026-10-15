/** Restore orchestration is independent of SDK stores and UI. Revalidate after
 * each asynchronous boundary before touching the editor or persistence owner. */
export async function restoreNativeHistory({
  assertOwner,
  beforeRestore,
  load,
  apply,
  save,
}: {
  assertOwner: () => void;
  beforeRestore: () => Promise<void>;
  load: () => Promise<{ editorData: unknown }>;
  apply: (editorData: unknown) => void;
  save: () => Promise<void>;
}): Promise<void> {
  assertOwner();
  const snapshot = await load();
  assertOwner();
  await beforeRestore();
  assertOwner();
  apply(snapshot.editorData);
  assertOwner();
  await save();
  assertOwner();
}
