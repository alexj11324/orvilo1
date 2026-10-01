import { isRecord } from '@orvilo/utils/object';
import Ajv from 'ajv';
import { z } from 'zod';

import type { McpEventDefinition, McpSubscribeParams, McpUnsubscribeParams } from './protocol';
import {
  MCP_EVENTS_METHODS,
  MCP_EVENTS_PROTOCOL_VERSION,
  mcpEventsListSchema,
  mcpSubscribeResultSchema,
} from './protocol';

/** The caller supplies the already authenticated connector transport. */
export interface McpEventsTransport {
  request: (
    method: string,
    params?: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => Promise<unknown>;
}

const discoverySchema = z.object({
  capabilities: z.object({ events: z.record(z.string(), z.unknown()).optional() }),
  resultType: z.literal('complete'),
  supportedVersions: z.array(z.string()),
});

const isMethodNotFound = (error: unknown) => isRecord(error) && error.code === -32601;
const MAX_CATALOG_PAGES = 100;
const MAX_CATALOG_EVENTS = 1000;

export interface McpEventsDiscovery {
  events: McpEventDefinition[];
  supported: boolean;
}

/** Events are optional: old MCP tools continue through their existing client. */
export class McpEventsAdapter {
  constructor(private readonly transport: McpEventsTransport) {}

  async discover(): Promise<McpEventsDiscovery> {
    let result: unknown;
    try {
      result = await this.transport.request(MCP_EVENTS_METHODS.discover);
    } catch (error) {
      if (isMethodNotFound(error)) return { events: [], supported: false };
      throw error;
    }
    const discovery = discoverySchema.parse(result);
    if (
      !discovery.capabilities.events ||
      !discovery.supportedVersions.includes(MCP_EVENTS_PROTOCOL_VERSION)
    ) {
      return { events: [], supported: false };
    }

    const events: McpEventDefinition[] = [];
    const names = new Set<string>();
    const cursors = new Set<string>();
    let pages = 0;
    let cursor: string | undefined;
    do {
      const page = mcpEventsListSchema.parse(
        await this.transport.request(MCP_EVENTS_METHODS.list, cursor ? { cursor } : {}),
      );
      if (++pages > MAX_CATALOG_PAGES || events.length + page.events.length > MAX_CATALOG_EVENTS) {
        throw new Error('MCP event catalog exceeds discovery limits');
      }
      for (const event of page.events) {
        if (names.has(event.name)) throw new Error('MCP event catalog repeated an event name');
        names.add(event.name);
      }
      events.push(...page.events);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor))
        throw new Error('MCP events/list repeated a pagination cursor');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return { events, supported: true };
  }

  async subscribe(params: McpSubscribeParams, signal?: AbortSignal) {
    return mcpSubscribeResultSchema.parse(
      await this.transport.request(
        MCP_EVENTS_METHODS.subscribe,
        { ...params },
        signal ? { signal } : undefined,
      ),
    );
  }

  async unsubscribe(params: McpUnsubscribeParams) {
    try {
      await this.transport.request(MCP_EVENTS_METHODS.unsubscribe, { ...params });
    } catch (error) {
      // The design sketch permits NotFound for an already absent subscription.
      if (!(
        isRecord(error) &&
        error.code === -32011 &&
        isRecord(error.data) &&
        error.data.kind === 'subscription'
      )) {
        throw error;
      }
    }
  }
}

export type McpEventSourceSelection =
  | { event: McpEventDefinition; kind: 'mcp' }
  | {
      kind: 'native' | 'unavailable';
      reason: 'events_unavailable' | 'event_unavailable' | 'webhook_unavailable';
    };

/** Unsupported connectors/modes fall back to the existing native source registry. */
export function selectMcpEventSource(
  discovery: McpEventsDiscovery,
  eventName: string,
  nativeSourceAvailable = false,
): McpEventSourceSelection {
  const kind = nativeSourceAvailable ? 'native' : 'unavailable';
  if (!discovery.supported) return { kind, reason: 'events_unavailable' };
  const event = discovery.events.find((definition) => definition.name === eventName);
  if (!event) return { kind, reason: 'event_unavailable' };
  if (!event.delivery.includes('webhook')) return { kind, reason: 'webhook_unavailable' };
  return { event, kind: 'mcp' };
}

export function validateMcpSubscriptionArguments(
  event: McpEventDefinition,
  args: Record<string, unknown>,
) {
  // Unknown formats/keywords fail compilation rather than silently bypassing
  // constraints. A format registry can be supplied once the host supports it.
  const validate = new Ajv({
    allErrors: true,
    strict: false,
    strictSchema: true,
    validateFormats: true,
  }).compile(event.inputSchema);
  if (!validate(args)) throw new Error('MCP event arguments do not match inputSchema');
}
