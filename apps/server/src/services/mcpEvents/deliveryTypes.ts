import type { AcceptedMcpEvent, McpInboxDelivery } from '@orvilo/types';

export type { AcceptedMcpEvent, McpEventBinding, McpInboxDelivery } from '@orvilo/types';

export interface McpEventInbox {
  accept: (event: AcceptedMcpEvent) => Promise<'accepted' | 'duplicate' | 'conflict'>;
  claim: (
    now: number,
    leaseMs: number,
    limit?: number,
    tenantId?: string,
  ) => Promise<McpInboxDelivery[]>;
  settle: (
    id: string,
    leaseToken: string,
    now: number,
    outcome:
      | { status: 'completed' }
      | {
          status: 'pending' | 'dead';
          availableAt: number;
          errorCode: string;
          preserveAttempts?: boolean;
        },
  ) => Promise<boolean>;
}
