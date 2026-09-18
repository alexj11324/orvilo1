import type { TracePayload } from '@orvilo/const';
import { ORVILO_TRACE_HEADER, ORVILO_TRACE_ID } from '@orvilo/const';
import { Buffer } from 'buffer.js';

export const getTracePayload = (req: Request): TracePayload | undefined => {
  const header = req.headers.get(ORVILO_TRACE_HEADER);
  if (!header) return;

  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    // Ignore malformed trace header - return undefined to skip tracing
    return undefined;
  }
};

export const getTraceId = (res: Response) => res.headers.get(ORVILO_TRACE_ID);

const createTracePayload = (data: TracePayload) => {
  const buffer = new TextEncoder().encode(JSON.stringify(data));

  return Buffer.from(buffer).toString('base64');
};

export const createTraceHeader = (data: TracePayload) => {
  return { [ORVILO_TRACE_HEADER]: createTracePayload(data) };
};
