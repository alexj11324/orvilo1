import { describe, expect, it } from 'vitest';

import {
  createOutcome,
  extractServerMessage,
  resolveAutoConnectGate,
  resolveLocalState,
  resolveRegisterOutcome,
} from '../gatewayLocalState';

const NOW = 1_700_000_000_000;

describe('resolveAutoConnectGate', () => {
  const ready = { gatewayEnabled: true, hasToken: true, isConfigured: true };

  it('lets auto-connect proceed when every precondition holds', () => {
    expect(resolveAutoConnectGate(ready, NOW)).toBeNull();
  });

  it('reports disabled when the gateway switch is off', () => {
    expect(resolveAutoConnectGate({ ...ready, gatewayEnabled: false }, NOW)?.phase).toBe(
      'disabled',
    );
  });

  it('reports notConfigured when there is no active remote server', () => {
    expect(resolveAutoConnectGate({ ...ready, isConfigured: false }, NOW)?.phase).toBe(
      'notConfigured',
    );
  });

  it('reports signInRequired when the access token is missing', () => {
    expect(resolveAutoConnectGate({ ...ready, hasToken: false }, NOW)?.phase).toBe(
      'signInRequired',
    );
  });

  it('checks disabled before configuration before token', () => {
    const none = { gatewayEnabled: false, hasToken: false, isConfigured: false };
    expect(resolveAutoConnectGate(none, NOW)?.phase).toBe('disabled');
    expect(resolveAutoConnectGate({ ...none, gatewayEnabled: true }, NOW)?.phase).toBe(
      'notConfigured',
    );
  });
});

describe('resolveRegisterOutcome', () => {
  it('maps a non-2xx response to registerFailed with the status code', () => {
    const outcome = resolveRegisterOutcome({ ok: false, status: 401 }, NOW);
    expect(outcome.phase).toBe('registerFailed');
    expect(outcome.reason).toBe('HTTP 401');
  });

  it('includes a short server message and clips long ones', () => {
    const outcome = resolveRegisterOutcome(
      { message: 'x'.repeat(500), ok: false, status: 500 },
      NOW,
    );
    expect(outcome.phase).toBe('registerFailed');
    expect(outcome.reason).toMatch(/^HTTP 500: x+…$/);
    expect(outcome.reason!.length).toBeLessThanOrEqual(161);
  });

  it('treats a 2xx response as success', () => {
    expect(resolveRegisterOutcome({ ok: true, status: 200 }, NOW)).toEqual({
      at: NOW,
      phase: 'connecting',
    });
  });
});

describe('extractServerMessage', () => {
  it('reads the tRPC error message', () => {
    expect(extractServerMessage('{"error":{"json":{"message":"UNAUTHORIZED"}}}')).toBe(
      'UNAUTHORIZED',
    );
    expect(extractServerMessage('[{"error":{"json":{"message":"Bad"}}}]')).toBe('Bad');
  });

  it('returns undefined for non-JSON or unexpected bodies', () => {
    expect(extractServerMessage('<html>502</html>')).toBeUndefined();
    expect(extractServerMessage('{}')).toBeUndefined();
  });
});

describe('resolveLocalState', () => {
  it('keeps registerFailed even when the socket is connected', () => {
    const recorded = createOutcome('registerFailed', NOW, 'HTTP 403');
    expect(resolveLocalState({ recorded, status: 'connected' }, NOW + 1)).toEqual(recorded);
  });

  it('keeps signInRequired regardless of the socket', () => {
    const recorded = createOutcome('signInRequired', NOW);
    expect(resolveLocalState({ recorded, status: 'disconnected' }, NOW + 1)).toEqual(recorded);
  });

  it('reports connected once the socket is up after a successful register', () => {
    const recorded = createOutcome('connecting', NOW);
    expect(resolveLocalState({ recorded, status: 'connected' }, NOW + 1).phase).toBe('connected');
  });

  it('reports connecting while the socket handshake is in flight', () => {
    const recorded = createOutcome('connecting', NOW);
    for (const status of ['connecting', 'authenticating', 'reconnecting'] as const) {
      expect(resolveLocalState({ recorded, status }, NOW + 1).phase).toBe('connecting');
    }
  });

  it('reports gatewayUnreachable when the socket closed after an attempt', () => {
    const recorded = createOutcome('connecting', NOW);
    const state = resolveLocalState({ recorded, status: 'disconnected' }, NOW + 1);
    expect(state.phase).toBe('gatewayUnreachable');
    expect(state.reason).toBeTruthy();
  });

  it('keeps a recorded gatewayUnreachable reason, but yields to a live socket', () => {
    const recorded = createOutcome('gatewayUnreachable', NOW, 'ECONNREFUSED');
    expect(resolveLocalState({ recorded, status: 'disconnected' }, NOW + 1).reason).toBe(
      'ECONNREFUSED',
    );
    expect(resolveLocalState({ recorded, status: 'connected' }, NOW + 1).phase).toBe('connected');
  });

  it('reports registering while the registry call is pending', () => {
    const recorded = createOutcome('registering', NOW);
    expect(resolveLocalState({ recorded, status: 'disconnected' }, NOW + 1).phase).toBe(
      'registering',
    );
  });

  it('falls back to disabled before anything was recorded and the socket is closed', () => {
    expect(resolveLocalState({ status: 'disconnected' }, NOW).phase).toBe('disabled');
  });
});
