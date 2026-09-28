/**
 * Session Auth Event System
 *
 * One funnel for every "the session can no longer authenticate" signal, on
 * every client. Producers emit `session-auth-expired`; exactly one adapter per
 * platform subscribes and owns the recovery transport:
 *
 * - Web: `WebSessionAuthRecovery` (logout + `/signin` redirect, or the
 *   login-required notification when already signed out).
 * - Desktop: `AuthRequiredModal` (system-browser OIDC round trip), fed by both
 *   the tRPC error link and the main-process `authorizationRequired`
 *   broadcast — whichever spots the 401 first.
 *
 * Mirrors `marketAuthEvents`, which stays separate on purpose: a market.* 401
 * is a Marketplace credential problem, not an Orvilo session expiry.
 */

export type SessionAuthEventType = 'session-auth-expired';

export interface SessionAuthExpiredEvent {
  /** tRPC operation path when the signal came from the error link. */
  path?: string;
  /** Why the session is considered expired (log-grade detail). */
  reason: string;
  /** Which transport layer spotted the failure. */
  source: 'desktop-proxy' | 'trpc';
  timestamp: number;
}

type EventCallback = (event: SessionAuthExpiredEvent) => void;

class SessionAuthEventEmitter {
  private listeners: Map<SessionAuthEventType, Set<EventCallback>> = new Map();

  on(event: SessionAuthEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: SessionAuthEventType, data: SessionAuthExpiredEvent): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('[SessionAuthEvents] Error in event callback:', error);
      }
    });
  }
}

export const sessionAuthEvents = new SessionAuthEventEmitter();
