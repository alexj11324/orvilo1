import { isDesktop } from '@orvilo/const';
import type { DeviceOperationError } from '@orvilo/types';

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
 * Thrown when a device-bound operation exists but the client has no transport
 * that can execute it on that device (e.g. the desktop IPC leg only runs on
 * the local device and no device RPC exists yet). Carries the contract's
 * `DeviceOperationError` shape so `isDeviceOperationError` discriminates it
 * like the structured results the device RPCs return.
 */
export class UnsupportedDeviceOperationError extends Error implements DeviceOperationError {
  readonly code = 'OPERATION_UNSUPPORTED' as const;
  readonly deviceId?: string;
  readonly operation: string;
  readonly status = 'error' as const;

  constructor(deviceId: string | undefined, operation: string, detail?: string) {
    super(
      `"${operation}" is not supported on device ${deviceId ?? '<unknown>'}` +
        (detail ? `: ${detail}` : ''),
    );
    this.name = 'UnsupportedDeviceOperationError';
    this.deviceId = deviceId;
    this.operation = operation;
  }
}

export const TARGET_QUERY_FAILED_ERROR_CODE = 'TARGET_QUERY_FAILED' as const;

/**
 * The operation DID name a scope (a conversation, a bound device), but the
 * authoritative binding could not be read — a cache miss is never "unbound",
 * and an unreadable binding is never a license to execute on another
 * machine. Distinct from `TargetRequiredError` (no target was named): the
 * caller surfaces a failed lookup and retries, never falls back locally.
 */
export class TargetQueryFailedError extends Error implements DeviceOperationError {
  readonly code = TARGET_QUERY_FAILED_ERROR_CODE;
  readonly operation: string;
  readonly status = 'error' as const;

  constructor(operation: string, detail?: string) {
    super(`"${operation}" could not resolve its execution target` + (detail ? `: ${detail}` : ''));
    this.name = 'TargetQueryFailedError';
    this.operation = operation;
  }
}

export const isTargetQueryFailedError = (error: unknown): error is TargetQueryFailedError =>
  error instanceof TargetQueryFailedError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === TARGET_QUERY_FAILED_ERROR_CODE);

/**
 * Evidence that THIS client is itself an execution device: the host's proven
 * local device identity, resolved via the gateway device handshake (see
 * `resolveLocalExecutionIdentity`). Bare `isDesktop` is build metadata, not
 * proof — it never authorizes the local transport on its own.
 */
export interface LocalExecutionEvidence {
  /** The host's proven local device id (`localDeviceId` from the handshake). */
  localDeviceId?: string;
}

/**
 * Local-transport guard for the `deviceId ? device-RPC : Electron-IPC`
 * chokepoints. A bound `deviceId` always authorizes the device-RPC leg. The
 * IPC fallback is only valid when the caller proves local execution identity
 * (`evidence.localDeviceId` from the device handshake) — anywhere else (Web,
 * or a desktop whose handshake cannot be proven) the call must fail
 * explicitly instead of invoking an IPC bridge that cannot exist or is not
 * known to be this host's own device.
 */
export const requireLocalExecutionTransport = (
  deviceId: string | undefined,
  operation: string,
  localEvidence?: LocalExecutionEvidence,
): void => {
  if (deviceId) return;
  if (isDesktop && localEvidence?.localDeviceId) return;
  throw new TargetRequiredError(operation);
};
