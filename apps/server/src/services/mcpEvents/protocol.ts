import { randomBytes } from 'node:crypto';

import { z } from 'zod';

/** OpenAI's webhook profile of the experimental MCP Events design sketch. */
export const MCP_EVENTS_PROTOCOL_VERSION = '2026-07-28';
export const MCP_EVENTS_METHODS = {
  discover: 'server/discover',
  list: 'events/list',
  subscribe: 'events/subscribe',
  unsubscribe: 'events/unsubscribe',
} as const;

const objectSchema = z.record(z.string(), z.unknown());
const cursorSchema = z.string().nullable();
const timestampSchema = z.iso.datetime({ offset: true });

export const mcpEventDefinitionSchema = z.object({
  _meta: objectSchema.optional(),
  delivery: z.array(z.enum(['webhook', 'push', 'poll'])).min(1),
  description: z.string().optional(),
  inputSchema: objectSchema,
  name: z.string().min(1),
  payloadSchema: objectSchema,
});

export const mcpEventsListSchema = z.object({
  events: z.array(mcpEventDefinitionSchema),
  nextCursor: z.string().optional(),
});

export const mcpEventOccurrenceSchema = z.object({
  _meta: objectSchema.optional(),
  cursor: cursorSchema.optional(),
  data: objectSchema,
  eventId: z.string().min(1),
  name: z.string().min(1),
  timestamp: timestampSchema,
  type: z.never().optional(),
});

export const mcpVerificationChallengeSchema = z.object({
  challenge: z.string().min(1),
  type: z.literal('verification'),
});

export const mcpSubscribeResultSchema = z.object({
  cursor: cursorSchema,
  deliveryStatus: z
    .object({
      active: z.boolean(),
      failedSince: timestampSchema.optional(),
      lastDeliveryAt: timestampSchema.nullable().optional(),
      lastError: z
        .enum([
          'connection_refused',
          'timeout',
          'tls_error',
          'http_4xx',
          'http_5xx',
          'challenge_failed',
        ])
        .nullable()
        .optional(),
      retryAfterMs: z.number().int().nonnegative().optional(),
      throttled: z.boolean().optional(),
    })
    .optional(),
  id: z.string().min(1),
  refreshBefore: timestampSchema.nullable(),
  truncated: z.boolean(),
});

export type McpEventDefinition = z.infer<typeof mcpEventDefinitionSchema>;
export type McpEventOccurrence = z.infer<typeof mcpEventOccurrenceSchema>;
export type McpVerificationChallenge = z.infer<typeof mcpVerificationChallengeSchema>;
export type McpSubscribeResult = z.infer<typeof mcpSubscribeResultSchema>;

export interface McpSubscribeParams {
  arguments: Record<string, unknown>;
  cursor: string | null;
  delivery: { mode: 'webhook'; secret: string; url: string };
  maxAgeMs?: number;
  name: string;
  ttlMs?: number | null;
}

export interface McpUnsubscribeParams {
  arguments: Record<string, unknown>;
  delivery: { mode: 'webhook'; url: string };
  name: string;
}

export const createMcpSigningSecret = () => `whsec_${randomBytes(32).toString('base64')}`;

export function decodeMcpSigningSecret(secret: string): Buffer {
  if (!/^whsec_(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(secret)) {
    throw new Error('Invalid MCP signing secret');
  }
  const decoded = Buffer.from(secret.slice(6), 'base64');
  if (decoded.length < 24 || decoded.length > 64) throw new Error('Invalid MCP signing secret');
  return decoded;
}
