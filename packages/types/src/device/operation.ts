/**
 * Device operation contract — explicit-target semantics for every operation
 * that touches a machine (files, Git, terminal, MCP, agent runs).
 *
 * Rules this type layer encodes (normative sources:
 * docs/development/web-desktop-architecture.md, web-desktop-boundary-plan.md
 * §4.2/§4.3, device-execution-contract.md):
 *
 * - No `deviceId?: string` "absent means local" semantics on shared device
 *   APIs. The target is resolved first, then the operation carries it.
 * - A user browsing files uses their own authorized resource context — no
 *   fabricated Agent Run. An agent's tool calls use run context bound to that
 *   run's device, working directory, and execution generation.
 * - `undefined` never doubles as "not found" + "failed" + "unsupported".
 *   Unsupported is a first-class, discriminable answer.
 *
 * Pure types only: no React, no Electron, no database, no Node builtins.
 */

// ─── Resource references ──────────────────────────────────────────────────

/**
 * A file-system resource on a specific device, anchored to an authorized root
 * (`rootRef` = a granted working-directory / repo-binding record or a
 * server-issued scoped reference — never a raw client-side path).
 */
export interface DeviceResourceRef {
  /** The registered device that owns this resource. Required — always. */
  deviceId: string;
  /** Path inside the authorized root. Never absolute, never `..`-escaping. */
  relativePath: string;
  /** Reference to the authorized working-directory / repo binding. */
  rootRef: string;
}

// ─── Operation subjects ───────────────────────────────────────────────────

/**
 * Who/what an operation runs for. Two shapes, deliberately distinct:
 * - `resource`: a principal's own file/Git browsing under an authorized root.
 * - `run`: an agent run's tool call, bound to the run's operation +
 *   generation so stale-generation callbacks cannot settle newer state.
 */
export type DeviceActionSubject =
  | {
      kind: 'resource';
      resource: DeviceResourceRef;
    }
  | {
      executionGeneration: number;
      kind: 'run';
      operationId: string;
    };

// ─── Availability ─────────────────────────────────────────────────────────

/**
 * Explainable availability — the only answers an operation may give about its
 * own readiness. `unsupported` (this device/host implementation cannot do it
 * at all) is distinct from `blocked` (a condition is missing: permission,
 * binding, credential) and from `unavailable` (temporarily unreachable:
 * offline, gateway down).
 */
export type DeviceOperationAvailability =
  'blocked' | 'loading' | 'ready' | 'unavailable' | 'unsupported';

// ─── Operation errors ─────────────────────────────────────────────────────

/**
 * Machine-readable reasons an operation may not run. `OPERATION_UNSUPPORTED`
 * is the answer a device gives for a feature it does not implement — callers
 * render it as an honest "not supported" state, not as a silent empty result.
 */
export type DeviceOperationErrorCode =
  /** The persisted device binding is invalid; explicit repair required. */
  | 'DEVICE_BINDING_INVALID'
  /** The device is registered but unreachable right now (still a candidate). */
  | 'DEVICE_OFFLINE'
  /** No execution device bound or selected — pick/connect one first. */
  | 'DEVICE_REQUIRED'
  /** The principal lacks authorization for this device/action pair. */
  | 'DEVICE_UNAUTHORIZED'
  /** Capability exists but required credentials are not in place. */
  | 'CREDENTIALS_NOT_READY'
  /** The resource escapes the authorized root (path/root-ref mismatch). */
  | 'RESOURCE_OUT_OF_SCOPE'
  /** Host/device protocol versions cannot talk to each other. */
  | 'PROTOCOL_INCOMPATIBLE'
  /** OS-level permission missing on the device (screen recording, files…). */
  | 'PERMISSION_MISSING'
  /** The device does not implement this operation — honest "not supported". */
  | 'OPERATION_UNSUPPORTED'
  /** The target lookup itself failed — not "does not exist", not "empty". */
  | 'TARGET_QUERY_FAILED';

export interface DeviceOperationError {
  code: DeviceOperationErrorCode;
  /** Present when the failure is device-scoped. */
  deviceId?: string;
  /** Human-safe summary; never carries credentials or raw payload paths. */
  message?: string;
  status: 'error';
}

export const deviceOperationError = (
  code: DeviceOperationErrorCode,
  deviceId?: string,
  message?: string,
): DeviceOperationError => ({ code, deviceId, message, status: 'error' });

export const isDeviceOperationError = (value: unknown): value is DeviceOperationError =>
  typeof value === 'object' &&
  value !== null &&
  (value as { status?: unknown; code?: unknown }).status === 'error' &&
  typeof (value as { code?: unknown }).code === 'string';

/** Result of an operation attempt: either the value or the explained error. */
export type DeviceOperationResult<T> =
  { status: 'ok'; value: T } | { error: DeviceOperationError; status: 'error' };

export const deviceOperationOk = <T>(value: T): DeviceOperationResult<T> => ({
  status: 'ok',
  value,
});
