import { isDev } from '@/utils/env';

/**
 * In development, registers the store on `window.__ORVILO_STORES[name]` as a getter that returns
 * the current snapshot from `store.getState()`. Also enabled on production builds when the
 * `debug` localStorage flag names an orvilo-* namespace, so e2e diagnostics can read store
 * state (the getter is a read-only snapshot — it cannot mutate).
 */
export function expose<T>(name: string, store: { getState: () => T }): void {
  if (typeof window === 'undefined') return;
  if (!isDev && !window.localStorage.getItem('debug')?.includes('orvilo')) return;

  window.__ORVILO_STORES ??= {};
  window.__ORVILO_STORES[name] = () => store.getState();
}
