/**
 * Who a room connection or activity event belongs to.
 *
 * Always server-derived: the gateway stamps it from the verified room ticket
 * (or the outbox projection from the domain record), never from client input.
 * A client that sends actor fields has them ignored.
 */
export type CollaborationActorKind = 'agent' | 'human' | 'system';

export interface CollaborationActor {
  /** Optional display avatar URL carried in the ticket for presence rendering. */
  avatar?: string;
  /** Presence color, assigned server-side so every client agrees. */
  color?: string;
  /** User or agent id. */
  id: string;
  kind: CollaborationActorKind;
  /** Optional display name carried in the ticket for presence rendering. */
  name?: string;
  /**
   * Delegated execution: the human member whose delegation authorized an
   * agent's action. Never self-asserted — the server fills it from the
   * execution grant.
   */
  onBehalfOfUserId?: string;
}
