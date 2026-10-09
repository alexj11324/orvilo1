/**
 * Safety net for the title-only listener: slightly above the main process's
 * linger cap (`SESSION_TITLE_LINGER_MS`, 5 s), so a lost "window ended"
 * signal can never leak the listener.
 */
export const SESSION_TITLE_LISTENER_TIMEOUT_MS = 7000;

export interface SessionTitleWatcher {
  /**
   * The run's own teardown reached its `finally`. The listener stays alive
   * for a title that is still to come, until main reports the end of the
   * title window or the safety timeout fires.
   */
  detachAfterRun: () => void;
}

/**
 * Listen for the title an ACP agent reports for one IPC session. Independent
 * of the run's stream subscription: the first-turn title is generated after
 * the turn ends, i.e. after the run's own listeners are gone.
 */
export const watchSessionTitle = (
  sessionId: string,
  onTitle: (title: string) => void,
  timeoutMs = SESSION_TITLE_LISTENER_TIMEOUT_MS,
): SessionTitleWatcher => {
  const ipc = window.electron?.ipcRenderer;
  if (!ipc) return { detachAfterRun: () => {} };

  let disposed = false;
  let windowEnded = false;
  let runDetached = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubscribers: (() => void)[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };

  unsubscribers.push(
    ipc.on(
      'heteroAgentSessionTitle' as any,
      (_e: any, data: { sessionId: string; title: string }) => {
        if (data.sessionId === sessionId) onTitle(data.title);
      },
    ),
    ipc.on('heteroAgentSessionTitleEnd' as any, (_e: any, data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      windowEnded = true;
      // Before the run's teardown the listener goes away with the run; after
      // it, the end signal is what releases it.
      if (runDetached) dispose();
    }),
  );

  return {
    detachAfterRun: () => {
      runDetached = true;
      if (windowEnded) {
        dispose();
        return;
      }
      timer = setTimeout(dispose, timeoutMs);
    },
  };
};
