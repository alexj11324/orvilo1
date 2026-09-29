import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForOAuthSession } from './oauthSession';

const popupWindow = (closed = false) => ({ closed }) as unknown as Window;

const dispatchOAuthMessage = (popup: Window, origin: string, data: unknown) => {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { configurable: true, value: popup });
  window.dispatchEvent(event);
};

const sessionOptions = (
  popup: Window,
  over: Partial<Parameters<typeof waitForOAuthSession>[0]> = {},
) => ({
  attempt: 'attempt-1',
  messageType: 'orvilo-connector-oauth',
  popup,
  ...over,
});

describe('waitForOAuthSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles success only on a matching attempt + popup + origin', async () => {
    const popup = popupWindow();
    const result = waitForOAuthSession(sessionOptions(popup));

    dispatchOAuthMessage(popup, 'https://attacker.example', {
      attempt: 'attempt-1',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    dispatchOAuthMessage(popupWindow(), window.location.origin, {
      attempt: 'attempt-1',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'stale-attempt',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    // A result with NO attempt at all must never settle the session — this is
    // the regression guard for messages accepted without identity.
    dispatchOAuthMessage(popup, window.location.origin, {
      success: true,
      type: 'orvilo-connector-oauth',
    });
    await vi.advanceTimersByTimeAsync(0);

    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'attempt-1',
      success: true,
      synced: true,
      type: 'orvilo-connector-oauth',
    });

    await expect(result).resolves.toEqual({ status: 'success', synced: true });
  });

  it('rejects a message whose connectorId belongs to another connector', async () => {
    const popup = popupWindow();
    const result = waitForOAuthSession(sessionOptions(popup, { connectorId: 'connector-1' }));

    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'attempt-1',
      connectorId: 'other-connector',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    await vi.advanceTimersByTimeAsync(0);

    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'attempt-1',
      connectorId: 'connector-1',
      success: false,
      error: 'authorization_denied',
      type: 'orvilo-connector-oauth',
    });

    await expect(result).resolves.toEqual({
      error: 'authorization_denied',
      status: 'error',
    });
  });

  it('converges to timed-out at the deadline and settles once', async () => {
    const popup = popupWindow();
    const checkStatus = vi.fn().mockResolvedValue(false);
    const result = waitForOAuthSession(sessionOptions(popup, { checkStatus, timeoutMs: 1000 }));

    await vi.advanceTimersByTimeAsync(1100);

    await expect(result).resolves.toEqual({ status: 'timed-out' });
    expect(checkStatus).toHaveBeenCalledTimes(1);

    // Late messages after a terminal settle are ignored.
    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'attempt-1',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    await vi.advanceTimersByTimeAsync(0);
  });

  it('recovers a dropped result message via checkStatus instead of failing', async () => {
    const popup = popupWindow();
    const checkStatus = vi.fn().mockResolvedValue(true);
    const result = waitForOAuthSession(sessionOptions(popup, { checkStatus, timeoutMs: 500 }));

    await vi.advanceTimersByTimeAsync(600);

    await expect(result).resolves.toEqual({ status: 'success' });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it('settles dismissed when the popup closes early, after a status re-check', async () => {
    const popup = popupWindow(true);
    const checkStatus = vi.fn().mockResolvedValue(false);
    const result = waitForOAuthSession(sessionOptions(popup, { checkStatus }));

    await vi.advanceTimersByTimeAsync(900);

    await expect(result).resolves.toEqual({ status: 'dismissed' });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it('settles cancelled on abort, closes the popup, and cleans listeners', async () => {
    const close = vi.fn();
    const popup = { close, closed: false } as unknown as Window;
    const controller = new AbortController();
    const result = waitForOAuthSession(sessionOptions(popup, { signal: controller.signal }));

    controller.abort();

    await expect(result).resolves.toEqual({ status: 'cancelled' });
    expect(close).toHaveBeenCalledTimes(1);

    // A stale message after cancel must not flip the outcome.
    dispatchOAuthMessage(popup, window.location.origin, {
      attempt: 'attempt-1',
      success: true,
      type: 'orvilo-connector-oauth',
    });
    await vi.advanceTimersByTimeAsync(0);
  });
});
