import type {
  GatewayConnectionStatus,
  GatewayLocalPhase,
  GatewayLocalState,
} from '@orvilo/electron-client-ipc';

/**
 * Pure mapping from raw connection conditions to the user-facing
 * {@link GatewayLocalState}. Kept free of Electron/IO so it can be unit tested.
 */

const MAX_REASON_LENGTH = 160;

/** Phases recorded explicitly; `connected` is always derived from the live socket. */
export type RecordedPhase = Exclude<GatewayLocalPhase, 'connected'>;

export interface RecordedOutcome {
  at: number;
  phase: RecordedPhase;
  reason?: string;
}

const clip = (text: string) => {
  const flat = text.replaceAll(/\s+/g, ' ').trim();
  return flat.length > MAX_REASON_LENGTH ? `${flat.slice(0, MAX_REASON_LENGTH)}…` : flat;
};

export const createOutcome = (
  phase: RecordedPhase,
  now: number,
  reason?: string,
): RecordedOutcome => ({ at: now, phase, ...(reason ? { reason: clip(reason) } : {}) });

/**
 * Auto-connect preconditions. Returns the outcome explaining why it must not
 * proceed, or `null` when every precondition holds.
 */
export const resolveAutoConnectGate = (
  input: { gatewayEnabled: boolean; hasToken: boolean; isConfigured: boolean },
  now: number,
): RecordedOutcome | null => {
  if (!input.gatewayEnabled) return createOutcome('disabled', now);
  if (!input.isConfigured) return createOutcome('notConfigured', now);
  if (!input.hasToken) return createOutcome('signInRequired', now);
  return null;
};

/**
 * Outcome of the `device.register` HTTP call. Takes only the status code and
 * an optional response message, never headers or tokens.
 */
export const resolveRegisterOutcome = (
  response: { message?: string; ok: boolean; status: number },
  now: number,
): RecordedOutcome => {
  if (response.ok) return createOutcome('connecting', now);
  const detail = response.message ? `: ${response.message}` : '';
  return createOutcome('registerFailed', now, `HTTP ${response.status}${detail}`);
};

/** Pull a short server message out of a tRPC error body, if there is one. */
export const extractServerMessage = (body: string): string | undefined => {
  try {
    const parsed = JSON.parse(body);
    const message = (Array.isArray(parsed) ? parsed[0] : parsed)?.error?.json?.message;
    return typeof message === 'string' ? message : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Combine the last recorded outcome with the live WebSocket status. A recorded
 * failure (`registerFailed`, `signInRequired`, ...) wins over the socket: a
 * connected socket for a device the server never registered must not read as
 * healthy.
 */
export const resolveLocalState = (
  input: { recorded?: RecordedOutcome; status: GatewayConnectionStatus },
  now: number,
): GatewayLocalState => {
  const { recorded, status } = input;

  // Socket-dependent phases yield to the live status; everything else is a
  // recorded fact that the socket cannot disprove.
  const socketDependent =
    !recorded ||
    recorded.phase === 'connecting' ||
    recorded.phase === 'registering' ||
    recorded.phase === 'gatewayUnreachable';
  if (!socketDependent) return recorded;

  if (status === 'connected') return { at: recorded?.at ?? now, phase: 'connected' };
  if (recorded?.phase === 'registering') return recorded;
  if (status === 'disconnected') {
    if (!recorded) return { at: now, phase: 'disabled' };
    return recorded.phase === 'gatewayUnreachable'
      ? recorded
      : { at: now, phase: 'gatewayUnreachable', reason: 'Device gateway connection is closed' };
  }
  return { at: recorded?.at ?? now, phase: 'connecting' };
};
