/**
 * Headless `codex app-server` argv used by the read-only quota RPC
 * (apps/desktop `codexQuota`). Agent execution never reaches this — codex
 * turns run through the upstream `codex-acp` bridge — so no thread/turn
 * parameter composition lives here anymore.
 */
export const buildCodexAppServerArgs = (): string[] => ['app-server'];
