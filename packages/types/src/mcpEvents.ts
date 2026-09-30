/** Persisted MCP Events domain data, shared by the server and database schema. */
export interface PersistedMcpEventOccurrence {
  _meta?: Record<string, unknown>;
  cursor?: string | null;
  data: Record<string, unknown>;
  eventId: string;
  name: string;
  timestamp: string;
}

export interface McpEventBinding {
  callbackToken: string;
  callbackUrl: string;
  connectorId: string;
  cursor: string | null;
  eventArguments: Record<string, unknown>;
  eventName: string;
  expiresAt: number | null;
  id: string;
  maxAgeMs?: number;
  payloadSchema: Record<string, unknown>;
  refreshLeaseUntil?: number;
  remoteSubscriptionId: string | null;
  revision: number;
  schemaId: string;
  signingKeys: { secret: string; expiresAt?: number }[];
  state: 'pending' | 'active' | 'revoked';
  tenantId: string;
  truncated: boolean;
  ttlMs?: number | null;
}

export interface AcceptedMcpEvent {
  bindingRevision: number;
  connectorId: string;
  event: PersistedMcpEventOccurrence;
  rawBody: Uint8Array;
  receivedAt: number;
  schemaId: string;
  subscriptionId: string;
  tenantId: string;
}

export interface McpInboxDelivery extends Omit<AcceptedMcpEvent, 'rawBody'> {
  attempts: number;
  availableAt: number;
  id: string;
  lastError: string | null;
  leaseToken: string | null;
  leaseUntil: number | null;
  payloadHash: string;
  rawBodyBase64: string;
  status: 'pending' | 'processing' | 'completed' | 'dead';
}

export interface McpEventFilter {
  operator: 'equals' | 'contains';
  path: string[];
  value: string | number | boolean | null;
}

export type PersistedMcpInboxDelivery = Omit<
  McpInboxDelivery,
  'id' | 'status' | 'attempts' | 'availableAt' | 'leaseToken' | 'leaseUntil' | 'lastError'
>;
