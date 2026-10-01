import type { Readable, Writable } from 'node:stream';

import { isRecord } from '@orvilo/utils/object';

import type { PrimeAcpTransport } from './primeRuntime';

/** Attach only supervisor-owned streams. Never spawn, grant reverse requests or claim tree exit. */
export class PrimeStdioTransport implements PrimeAcpTransport {
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<(notification: { method: string; params: unknown }) => void>();
  private buffer = Buffer.alloc(0);
  private closed = false;
  private sequence = 0;
  constructor(
    private streams: { stdin: Writable; stdout: Readable },
    private timeoutMs = 30_000,
    private maxFrameBytes = 1_048_576,
  ) {
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isSafeInteger(maxFrameBytes) ||
      maxFrameBytes < 1
    )
      throw new Error('Invalid ACP limits');
    streams.stdout.on('data', this.receive);
    streams.stdout.once('end', this.close);
    streams.stdout.once('error', this.close);
    streams.stdin.once('error', this.close);
  }
  request(
    method: 'initialize' | 'session/new' | 'session/prompt',
    params: unknown,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('ACP transport closed'));
    if (this.pending.size >= 16) return Promise.reject(new Error('ACP request limit exceeded'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(this.close, this.timeoutMs);
      this.pending.set(id, { reject, resolve, timer });
      this.write({ id, jsonrpc: '2.0', method, params });
    });
  }
  subscribe(listener: (notification: { method: string; params: unknown }) => void): () => void {
    if (this.closed) throw new Error('ACP transport closed');
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
      pending.reject(new Error('ACP transport unavailable'));
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
      const frame = JSON.stringify(value) + '\n';
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
          if ('id' in message)
            this.write({
              error: { code: -32601, message: 'Reverse requests unavailable' },
              id: message.id,
              jsonrpc: '2.0',
            });
          else if (message.method === 'session/update')
            for (const listener of this.listeners)
              listener({ method: message.method, params: message.params });
        } else if (typeof message.id === 'number') {
          const pending = this.pending.get(message.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if ('error' in message || !('result' in message))
            pending.reject(new Error('ACP request failed'));
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
}
