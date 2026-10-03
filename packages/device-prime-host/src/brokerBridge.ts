/**
 * Device-side broker bridge — carries the runner's `broker.infer` reverse
 * requests to the control-side `/api/agent/prime-broker/*` surface over HTTP
 * and streams the NDJSON answers back as `broker.event` notifications.
 *
 * The harness transport's reverse handler is synchronous, so `broker.infer`
 * acks `{accepted: true}` immediately and the HTTP pump delivers events as
 * they arrive — exactly the wire grammar the embedded host runs in-process
 * (`createEmbeddedInferenceBridge` → transport notifications). A stream that
 * fails before opening reports `{type:'error'}` then `{type:'end'}` so the
 * runner's `done` gate always resolves.
 */
import {
  BROKER_CANCEL_METHOD,
  BROKER_INFER_METHOD,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isRecord } from '@orvilo/utils/object';

export interface PrimeDeviceHostLog {
  error: (format: string, ...args: unknown[]) => void;
  log: (format: string, ...args: unknown[]) => void;
}

export interface BrokerBridgeOptions {
  /** Bound operation credential — the `prime:infer` JWT, never a raw key. */
  credential: string;
  /** Control-side base (no trailing slash): `${serverUrl}/api/agent/prime-broker`. */
  endpoint: string;
  fetchImpl?: typeof fetch;
  log?: PrimeDeviceHostLog;
  /** Notify channel back into the runner (`transport.notify`). */
  sendEvent: (requestId: string, event: unknown) => void;
  sessionId: string;
}

interface ParsedInfer {
  request: Record<string, unknown>;
  requestId: string;
}

const parseInfer = (params: unknown): ParsedInfer | undefined => {
  if (!isRecord(params) || !isRecord(params.request)) return undefined;
  const { requestId } = params.request;
  if (typeof requestId !== 'string' || requestId.length === 0) return undefined;
  return { request: params.request, requestId };
};

const parseCancel = (params: unknown): string | undefined => {
  if (!isRecord(params) || typeof params.requestId !== 'string' || params.requestId.length === 0)
    return undefined;
  return params.requestId;
};

/**
 * Synchronous JSON-RPC reverse handler for the two broker methods.
 * Returns `{result}`/`{error}` — `undefined` means method-not-found and the
 * transport answers -32601 itself.
 */
export const createBrokerReverseHandler = (
  options: BrokerBridgeOptions,
): ((
  method: string,
  params: unknown,
) => { result?: unknown; error?: { code: number; message: string } } | undefined) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? console;
  const inflight = new Map<string, AbortController>();

  const emitError = (requestId: string, message: string): void => {
    options.sendEvent(requestId, { type: 'error', message });
    options.sendEvent(requestId, { type: 'end' });
  };

  const pump = async (sessionId: string | undefined, parsed: ParsedInfer): Promise<void> => {
    const controller = new AbortController();
    inflight.set(parsed.requestId, controller);
    let sawEnd = false;
    try {
      const response = await fetchImpl(`${options.endpoint}/infer`, {
        body: JSON.stringify({ request: parsed.request, sessionId }),
        headers: {
          'authorization': `Bearer ${options.credential}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        emitError(parsed.requestId, `Broker infer failed with HTTP ${response.status}`);
        return;
      }
      if (!response.body) {
        emitError(parsed.requestId, 'Broker infer returned no stream');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (;;) {
          const end = buffer.indexOf('\n');
          if (end === -1) break;
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (line.length === 0) continue;
          let parsedLine: unknown;
          try {
            parsedLine = JSON.parse(line);
          } catch {
            continue;
          }
          if (!isRecord(parsedLine)) continue;
          const requestId =
            typeof parsedLine.requestId === 'string' ? parsedLine.requestId : parsed.requestId;
          if (isRecord(parsedLine.event) && parsedLine.event.type === 'end') sawEnd = true;
          options.sendEvent(requestId, parsedLine.event);
        }
      }
      // The server's terminal 'end' frame is authoritative — only emit ours
      // when the stream closed without one (abrupt disconnect).
      if (!sawEnd) options.sendEvent(parsed.requestId, { type: 'end' });
    } catch (error) {
      if (!controller.signal.aborted)
        emitError(
          parsed.requestId,
          error instanceof Error ? error.message : 'Broker infer transport failed',
        );
      else options.sendEvent(parsed.requestId, { type: 'end' });
    } finally {
      inflight.delete(parsed.requestId);
      log.log('prime-device-host: broker pump closed requestId=%s', parsed.requestId);
    }
  };

  return (method, params) => {
    if (method === BROKER_INFER_METHOD) {
      const parsed = parseInfer(params);
      if (!parsed) return { error: { code: -32602, message: 'broker.infer params invalid' } };
      const sessionId =
        isRecord(params) && typeof params.sessionId === 'string'
          ? params.sessionId
          : options.sessionId;
      void pump(sessionId, parsed);
      return { result: { accepted: true, requestId: parsed.requestId } };
    }
    if (method === BROKER_CANCEL_METHOD) {
      const requestId = parseCancel(params);
      if (!requestId) return { error: { code: -32602, message: 'broker.cancel params invalid' } };
      inflight.get(requestId)?.abort();
      return { result: { ok: true } };
    }
    return undefined;
  };
};
