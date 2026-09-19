import { isDesktop } from '@orvilo/const';

export const TARGET_REQUIRED_ERROR_CODE = 'TARGET_REQUIRED' as const;

/**
 * Discriminable "no execution device" failure for the device-routed service
 * chokepoints (`gitService` / `projectFileService` / `projectSkillService` /
 * `heterogeneousAgentCatalogService` / `fetchClaudeCodeQuotaSnapshot`).
 *
 * Every client renders the same next step for it: pick an execution device or
 * connect one. It exists so a Web call without a bound device surfaces an
 * actionable error instead of falling into the Electron IPC transport and
 * dying on a missing preload bridge.
 */
export class TargetRequiredError extends Error {
  readonly code = TARGET_REQUIRED_ERROR_CODE;
  readonly operation: string;

  constructor(operation: string) {
    super(
      `"${operation}" requires an execution device: this client has no local runtime and no bound device`,
    );
    this.name = 'TargetRequiredError';
    this.operation = operation;
  }
}

export const isTargetRequiredError = (error: unknown): error is TargetRequiredError =>
  error instanceof TargetRequiredError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === TARGET_REQUIRED_ERROR_CODE);

/**
 * Local-transport guard for the `deviceId ? device-RPC : Electron-IPC`
 * chokepoints. The IPC fallback is only valid where a local runtime exists —
 * the desktop build, whose own machine is the implicit local device. Anywhere
 * else (Web without a bound device) the call must fail explicitly instead of
 * invoking an IPC bridge that cannot exist.
 */
export const requireLocalExecutionTransport = (
  deviceId: string | undefined,
  operation: string,
): void => {
  if (deviceId || isDesktop) return;
  throw new TargetRequiredError(operation);
};
