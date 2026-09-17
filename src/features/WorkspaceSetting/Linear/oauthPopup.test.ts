import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForLinearOAuthPopup } from './oauthPopup';

const popupWindow = (closed = false) => ({ closed }) as unknown as Window;

const dispatchOAuthMessage = (popup: Window, origin: string, data: unknown) => {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { configurable: true, value: popup });
  window.dispatchEvent(event);
};

describe('waitForLinearOAuthPopup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accepts only a success message from the expected popup and origin', async () => {
    const popup = popupWindow();
    const result = waitForLinearOAuthPopup(popup, 'https://orvilo.example');

    dispatchOAuthMessage(popup, 'https://attacker.example', {
      installationId: 'wrong-origin',
      success: true,
      type: 'orvilo-linear-oauth',
    });
    dispatchOAuthMessage(popupWindow(), 'https://orvilo.example', {
      installationId: 'wrong-popup',
      success: true,
      type: 'orvilo-linear-oauth',
    });
    await vi.advanceTimersByTimeAsync(0);

    dispatchOAuthMessage(popup, 'https://orvilo.example', {
      installationId: 'installation-1',
      success: true,
      type: 'orvilo-linear-oauth',
    });

    await expect(result).resolves.toEqual({
      installationId: 'installation-1',
      kind: 'success',
    });
  });

  it('surfaces callback failures and cleans up after the first result', async () => {
    const popup = popupWindow();
    const result = waitForLinearOAuthPopup(popup, 'https://orvilo.example');

    dispatchOAuthMessage(popup, 'https://orvilo.example', {
      error: 'authorization_denied',
      success: false,
      type: 'orvilo-linear-oauth',
    });
    dispatchOAuthMessage(popup, 'https://orvilo.example', {
      installationId: 'late-success',
      success: true,
      type: 'orvilo-linear-oauth',
    });

    await expect(result).resolves.toEqual({ error: 'authorization_denied', kind: 'error' });
    await vi.advanceTimersByTimeAsync(1000);
  });

  it('reports a user-closed popup separately from callback failure', async () => {
    const popup = popupWindow(true);
    const result = waitForLinearOAuthPopup(popup, 'https://orvilo.example');

    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toEqual({ kind: 'cancelled' });
  });
});
