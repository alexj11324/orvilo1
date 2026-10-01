/**
 * Bounded ndjson JSON-RPC transport for the Prime embedded harness.
 *
 * Generalizes primeStdioTransport.ts: same stream machinery, same bounds
 * (1 MiB frames, 16 pending, 30 s request timeout, strict UTF-8 decode), but
 * the vocabulary is the Orvilo harness protocol instead of ACP — forward
 * requests are stringly-typed so the runtime can send session/harness methods
 * with per-call timeouts, notifications are fanned out verbatim, and reverse
 * requests go through an allowlisted handler instead of unconditional -32601.
 */

import type { Readable, Writable } from 'node:stream';

import { isRecord } from '@orvilo/utils/object';

import {
  HARNESS_MAX_FRAME_BYTES,
  HARNESS_MAX_PENDING_REQUESTS,
  HARNESS_REQUEST_TIMEOUT_MS,
} from './harnessProtocol';

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface HarnessTransportNotification {
  method: string;
  params: unknown;
}

export type HarnessReverseHandler = (
  method: string,
  params: unknown,
) => { result?: unknown; error?: { code: number; message: string } } | undefined;

/** The structural surface PrimeEmbeddedRuntime drives — HarnessTransport
 * implements it; tests may substitute an in-memory double without casts. */
export interface HarnessChannel {
  /** Close settles every outstanding request; this does not prove tree exit. */
  close: () => void;
  notify: (method: string, params: unknown) => void;
  request: (method: string, params: unknown, options?: { timeoutMs?: number }) => Promise<unknown>;
  setReverseHandler: (handler: HarnessReverseHandler | undefined) => void;
  subscribe: (listener: (notification: { method: string; params: unknown }) => void) => () => void;
}

export interface HarnessTransportOptions {
  /** Maximum bytes per JSON frame, inbound or outbound. */
  maxFrameBytes?: number;
  /** Maximum unanswered outbound requests. */
  maxPending?: number;
  /** Per-request timeout in ms (can be overridden per call). */
  timeoutMs?: number;
}

/** Attach only supervisor-owned streams. Never spawn or claim tree exit. */
export class HarnessTransport implements HarnessChannel {
  private pending = new Map<number, PendingRequest>();
  private listeners = new Set<(notification: HarnessTransportNotification) => void>();
  private buffer = Buffer.alloc(0);
  private closed = false;
  private sequence = 0;
  private reverseHandler: HarnessReverseHandler | undefined;

  constructor(
    private streams: { stdin: Writable; stdout: Readable },
    options: HarnessTransportOptions = {},
  ) {
    const timeoutMs = options.timeoutMs ?? HARNESS_REQUEST_TIMEOUT_MS;
    const maxFrameBytes = options.maxFrameBytes ?? HARNESS_MAX_FRAME_BYTES;
    const maxPending = options.maxPending ?? HARNESS_MAX_PENDING_REQUESTS;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isSafeInteger(maxFrameBytes) ||
      maxFrameBytes < 1 ||
      !Number.isSafeInteger(maxPending) ||
      maxPending < 1
    )
      throw new Error('Invalid harness transport limits');
    this.defaultTimeoutMs = timeoutMs;
    this.maxFrameBytes = maxFrameBytes;
    this.maxPending = maxPending;
    streams.stdout.on('data', this.receive);
    streams.stdout.once('end', this.close);
    streams.stdout.once('error', this.close);
    streams.stdin.once('error', this.close);
  }

  private readonly defaultTimeoutMs: number;
  private readonly maxFrameBytes: number;
  private readonly maxPending: number;

  /**
   * Handler for runner→host requests. Return `{result}` to answer, `{error}`
   * for a JSON-RPC error, or `undefined` for -32601 method-not-found. Throwing
   * also answers -32601 — the wire must never see an unhandled rejection.
   */
  setReverseHandler(handler: HarnessReverseHandler | undefined): void {
    this.reverseHandler = handler;
  }

  request(method: string, params: unknown, options?: { timeoutMs?: number }): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Harness transport closed'));
    if (this.pending.size >= this.maxPending)
      return Promise.reject(new Error('Harness request limit exceeded'));
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
      return Promise.reject(new Error('Invalid harness request timeout'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(this.close, timeoutMs);
      this.pending.set(id, { reject, resolve, timer });
      this.write({ id, jsonrpc: '2.0', method, params });
    });
  }

  notify(method: string, params: unknown): void {
    if (this.closed) return;
    this.write({ jsonrpc: '2.0', method, params });
  }

  subscribe(listener: (notification: HarnessTransportNotification) => void): () => void {
    if (this.closed) throw new Error('Harness transport closed');
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close = (): void => {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Harness transport unavailable'));
    }
    this.pending.clear();
    this.listeners.clear();
    this.streams.stdout.off('data', this.receive);
    this.streams.stdout.off('end', this.close);
    this.streams.stdout.destroy();
    this.streams.stdin.destroy();
  };

  private write(value: unknown): void {
    try {
      const frame = `${JSON.stringify(value)}\n`;
      if (Buffer.byteLength(frame) + this.streams.stdin.writableLength > this.maxFrameBytes) {
        this.close();
        return;
      }
      this.streams.stdin.write(frame, (error) => {
        if (error) this.close();
      });
    } catch {
      this.close();
    }
  }

  private respond(id: unknown, outcome: unknown): void {
    if (typeof id !== 'number' && typeof id !== 'string') {
      // Malformed request id — the peer is not speaking the protocol.
      this.close();
      return;
    }
    if (isRecord(outcome) && 'error' in outcome && isRecord(outcome.error)) {
      this.write({ error: outcome.error, id, jsonrpc: '2.0' });
    } else {
      this.write({
        id,
        jsonrpc: '2.0',
        result: isRecord(outcome) && 'result' in outcome ? outcome.result : null,
      });
    }
  }

  private receive = (chunk: Buffer): void => {
    if (this.closed) return;
    for (let offset = 0; offset < chunk.length;) {
      const end = chunk.indexOf(10, offset);
      const stop = end === -1 ? chunk.length : end;
      const part = chunk.subarray(offset, stop);
      if (this.buffer.length + part.length > this.maxFrameBytes) {
        this.close();
        return;
      }
      this.buffer = Buffer.concat([this.buffer, part]);
      offset = stop + 1;
      if (end === -1) break;
      try {
        const message: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(this.buffer),
        );
        this.buffer = Buffer.alloc(0);
        if (!isRecord(message) || message.jsonrpc !== '2.0') {
          this.close();
          return;
        }
        if (typeof message.method === 'string') {
          if ('id' in message) {
            this.handleReverseRequest(message.id, message.method, message.params);
          } else {
            for (const listener of this.listeners)
              listener({ method: message.method, params: message.params });
          }
        } else if (typeof message.id === 'number') {
          const pending = this.pending.get(message.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if ('error' in message || !('result' in message))
            pending.reject(new Error('Harness request failed'));
          else pending.resolve(message.result);
        } else {
          this.close();
          return;
        }
      } catch {
        this.close();
        return;
      }
      if (this.closed) return;
    }
  };

  private handleReverseRequest(id: unknown, method: string, params: unknown): void {
    if (this.closed) return;
    let outcome: { result?: unknown; error?: { code: number; message: string } } | undefined;
    try {
      outcome = this.reverseHandler?.(method, params);
    } catch {
      outcome = undefined;
    }
    if (outcome === undefined) {
      this.write({
        error: { code: -32601, message: `Unsupported reverse request: ${method}` },
        id,
        jsonrpc: '2.0',
      });
      return;
    }
    this.respond(id, outcome);
  }
}
