/**
 * Runner-side ndjson JSON-RPC link — mirrors the host-side bounds
 * (HARNESS_MAX_FRAME_BYTES / HARNESS_MAX_PENDING_REQUESTS) so both ends
 * of the channel enforce the same limits independently.
 */

import type { Readable, Writable } from 'node:stream';

import {
  HARNESS_MAX_FRAME_BYTES,
  HARNESS_MAX_PENDING_REQUESTS,
  HARNESS_REQUEST_TIMEOUT_MS,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isRecord } from '@orvilo/utils/object';

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

type RequestHandler = (id: number | string, method: string, params: unknown) => void;
type NotificationHandler = (method: string, params: unknown) => void;

export class RunnerLink {
  private pending = new Map<string, PendingRequest>();
  private buffer = Buffer.alloc(0);
  private closed = false;
  private sequence = 0;
  private onRequest: RequestHandler | undefined;
  private onNotification: NotificationHandler | undefined;

  constructor(private streams: { input: Readable; output: Writable }) {
    streams.input.on('data', this.receive);
    streams.input.once('end', this.close);
    streams.input.once('error', this.close);
    streams.output.once('error', this.close);
  }

  setRequestHandler(handler: RequestHandler): void {
    this.onRequest = handler;
  }

  setNotificationHandler(handler: NotificationHandler): void {
    this.onNotification = handler;
  }

  /** runner → host request (broker.* vocabulary lives at a higher layer). */
  request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Runner link closed'));
    if (this.pending.size >= HARNESS_MAX_PENDING_REQUESTS)
      return Promise.reject(new Error('Runner request limit exceeded'));
    const id = `r${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(this.close, HARNESS_REQUEST_TIMEOUT_MS);
      this.pending.set(id, { reject, resolve, timer });
      this.write({ id, jsonrpc: '2.0', method, params });
    });
  }

  notify(method: string, params: unknown): void {
    if (this.closed) return;
    this.write({ jsonrpc: '2.0', method, params });
  }

  respond(id: number | string, result: unknown): void {
    if (this.closed) return;
    this.write({ id, jsonrpc: '2.0', result });
  }

  respondError(id: number | string, code: number, message: string): void {
    if (this.closed) return;
    this.write({ error: { code, message }, id, jsonrpc: '2.0' });
  }

  close = (): void => {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Runner link unavailable'));
    }
    this.pending.clear();
    this.streams.input.off('data', this.receive);
    this.streams.input.off('end', this.close);
    this.streams.input.destroy();
  };

  private write(value: unknown): void {
    try {
      const frame = `${JSON.stringify(value)}\n`;
      if (Buffer.byteLength(frame) + this.streams.output.writableLength > HARNESS_MAX_FRAME_BYTES) {
        this.close();
        return;
      }
      this.streams.output.write(frame, (error) => {
        if (error) this.close();
      });
    } catch {
      this.close();
    }
  }

  private receive = (chunk: Buffer): void => {
    if (this.closed) return;
    for (let offset = 0; offset < chunk.length;) {
      const end = chunk.indexOf(10, offset);
      const stop = end === -1 ? chunk.length : end;
      const part = chunk.subarray(offset, stop);
      if (this.buffer.length + part.length > HARNESS_MAX_FRAME_BYTES) {
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
          if (
            'id' in message &&
            (typeof message.id === 'number' || typeof message.id === 'string')
          ) {
            try {
              this.onRequest?.(message.id, message.method, message.params);
            } catch (error) {
              console.error('runner request handler threw', error);
              this.respondError(message.id, -32603, 'Runner request failed');
            }
          } else {
            try {
              this.onNotification?.(message.method, message.params);
            } catch (error) {
              console.error('runner notification handler threw', error);
            }
          }
        } else if (
          (typeof message.id === 'string' || typeof message.id === 'number') &&
          ('result' in message || 'error' in message)
        ) {
          const pending = this.pending.get(String(message.id));
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.pending.delete(String(message.id));
          if ('error' in message) {
            const detail = isRecord(message.error)
              ? ` (${JSON.stringify(message.error).slice(0, 200)})`
              : '';
            pending.reject(new Error(`Runner request failed${detail}`));
          } else {
            pending.resolve(message.result);
          }
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
}
