/**
 * Debug-gated diagnostics ring for the gateway transport leg — lets e2e
 * failure dumps show connect → terminal event → session_complete for ops
 * stuck `running` (read by scroll.steps.ts `dumpScrollDiagnostics`).
 * Mirrors `__orviloScrollDiag` in useConversationScroll.
 */
export const pushGatewayDiag = (line: string) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!window.localStorage.getItem('debug')?.includes('orvilo')) return;
    const root = globalThis as { __orviloGatewayDiag?: string[] };
    const buf = (root.__orviloGatewayDiag ??= []);
    buf.push(`${Math.round(performance.now())} ${line}`);
    if (buf.length > 300) buf.splice(0, buf.length - 300);
  } catch {
    // diagnostics must never break the transport
  }
};
