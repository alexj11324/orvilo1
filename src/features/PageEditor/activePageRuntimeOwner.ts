/** A mounted page may configure the shared Runtime only while DocumentStore
 * identifies that exact document/editor pair as active. Registration order and
 * stale component cleanup never establish ownership. */
export interface ActivePageRuntimeOwnerState {
  activeDocumentId: string | undefined;
  editor: unknown;
}

interface OwnerSource {
  getState: () => ActivePageRuntimeOwnerState;
  subscribe: (listener: () => void) => () => void;
}

const runtimeOwners = new WeakMap<object, { dispose: () => void; token: object }>();

export function bindActivePageRuntimeOwner({
  runtime,
  editor,
  documentId,
  source,
  bind,
}: {
  runtime: object;
  editor: unknown;
  documentId: string | undefined;
  source: OwnerSource;
  bind: () => () => void;
}): () => void {
  const token = {};
  const release = () => {
    const current = runtimeOwners.get(runtime);
    if (current?.token !== token) return;
    runtimeOwners.delete(runtime);
    current.dispose();
  };
  const sync = () => {
    const state = source.getState();
    if (state.editor !== editor || state.activeDocumentId !== documentId) {
      release();
      return;
    }
    const current = runtimeOwners.get(runtime);
    if (current?.token === token) return;
    // Release the old handler set before publishing the newly active owner.
    // A late unmount from the previous page then observes a different token.
    if (current) {
      runtimeOwners.delete(runtime);
      current.dispose();
    }
    runtimeOwners.set(runtime, { dispose: bind(), token });
  };
  const unsubscribe = source.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    release();
  };
}
