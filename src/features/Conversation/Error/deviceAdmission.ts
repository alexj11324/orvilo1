import type { DeviceAdmissionErrorData, DeviceListItem } from '@orvilo/types';

/**
 * Device-execution admission errors (FIX-A contract) arrive on the chat error
 * body verbatim from the server: `{ code, deviceId?, repairCandidates?,
 * retryable, scope, detail? }`. The card branches on `code` — never on the
 * localized `detail`/`message` text — so each blocked state gets its ONE true
 * action and the same `code` survives API → stream → store → UI untouched.
 */

const DEVICE_ADMISSION_ERROR_CODES = new Set<string>([
  'DEVICE_ACCESS_DENIED',
  'DEVICE_BINDING_CONFLICT',
  'DEVICE_BINDING_INVALID',
  'DEVICE_INVENTORY_INCOMPLETE',
  'DEVICE_NOT_FOUND',
  'DEVICE_REQUEST_UNAUTHORIZED',
  'DEVICE_REQUIRED',
  'DEVICE_SELECTION_REQUIRED',
  'DISPATCH_ADMISSION_PERSIST_FAILED',
  'EXECUTION_TARGET_NONE',
]);

export type DeviceAdmissionErrorBody = DeviceAdmissionErrorData & {
  /** Human-readable sentence authored by the server — display, never parse. */
  detail?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isDeviceAdmissionErrorBody = (body: unknown): body is DeviceAdmissionErrorBody =>
  isRecord(body) && typeof body.code === 'string' && DEVICE_ADMISSION_ERROR_CODES.has(body.code);

/**
 * The single true action a blocked run offers. Mapping is 1:1 per state — a
 * generic "fix" is what this contract exists to remove.
 */
export type DeviceAdmissionAction =
  'connect' | 'repair' | 'request-authorization' | 'retry-inventory' | 'view-run-status';

export const resolveDeviceAdmissionAction = (
  errorData: DeviceAdmissionErrorData,
): DeviceAdmissionAction => {
  switch (errorData.code) {
    case 'DEVICE_INVENTORY_INCOMPLETE': {
      // The inventory read itself failed — the only honest next step is to
      // ask again (the server re-resolves the pool on retry).
      return 'retry-inventory';
    }
    case 'DEVICE_REQUIRED': {
      return 'connect';
    }
    case 'DEVICE_ACCESS_DENIED':
    case 'DEVICE_REQUEST_UNAUTHORIZED': {
      return 'request-authorization';
    }
    case 'DEVICE_BINDING_CONFLICT':
    case 'DEVICE_BINDING_INVALID':
    case 'DEVICE_SELECTION_REQUIRED':
    case 'EXECUTION_TARGET_NONE': {
      return 'repair';
    }
    case 'DEVICE_NOT_FOUND': {
      // With named repair candidates the user repairs in place; without them
      // the only way forward is to enroll a device.
      return errorData.repairCandidates?.length ? 'repair' : 'connect';
    }
    case 'DISPATCH_ADMISSION_PERSIST_FAILED': {
      // The admission record write failed before any spawn — the run's status
      // surface answers "did anything start?".
      return 'view-run-status';
    }
    default: {
      return 'connect';
    }
  }
};

/**
 * The repair picker is constrained to `repairCandidates` — the candidate ids
 * the admission decision itself judged legal. When the server did not name
 * them (e.g. `DEVICE_SELECTION_REQUIRED` carries none), the shared client-side
 * candidate pool is the constraint so the UI never offers an illegal target.
 */
export const resolveRepairCandidates = (
  errorData: DeviceAdmissionErrorData,
  selectableDevices: DeviceListItem[],
): DeviceListItem[] => {
  if (!errorData.repairCandidates?.length) return selectableDevices;
  const allowed = new Set(errorData.repairCandidates);
  return selectableDevices.filter((device) => allowed.has(device.deviceId));
};

export const deviceDisplayName = (device: DeviceListItem): string =>
  device.friendlyName || device.hostname || device.deviceId;
