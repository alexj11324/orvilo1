import type { AcceptedMcpEvent, McpInboxDelivery } from '@orvilo/types';

export type { AcceptedMcpEvent, McpEventBinding, McpInboxDelivery } from '@orvilo/types';

export interface McpEventInbox {
  accept: (
    event: AcceptedMcpEvent,
  ) => Promise<'accepted' | 'duplicate' | 'conflict' | 'overloaded'>;
  claim: (
    now: number,
    leaseMs: number,
    limit?: number,
    tenantId?: string,
  ) => Promise<McpInboxDelivery[]>;
  /** Extend only a live lease owned by this worker; an expired lease cannot be revived. */
  renew: (id: string, leaseToken: string, now: number, leaseMs: number) => Promise<boolean>;
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
