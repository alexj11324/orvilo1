import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { and, eq, isNull, notInArray, or, type SQL } from 'drizzle-orm';

import { agents } from '../schemas';

/**
 * Builtins (Inbox, the agent builders) are provisioned per user and carry
 * `virtual: true` just like a group's own members — so without this they would
 * classify as OWNED the moment one landed on a roster, and the owned paths
 * delete them (group delete, roster removal) or rehome them into another scope
 * (group transfer). `addAgentsToGroup` refuses them at the door; this keeps a
 * malformed row from costing somebody their Inbox anyway.
 */
const RESERVED_BUILTIN_AGENT_SLUGS: string[] = Object.values(BUILTIN_AGENT_SLUGS);

/**
 * How a `chat_groups_agents` row binds an agent's LIFECYCLE to its group.
 *
 * This is deliberately separate from `chat_groups_agents.role`, which says what
 * the member DOES in the conversation (`supervisor` / `participant` / …):
 * `role` governs function, membership governs ownership.
 *
 * - `owned` — the agent exists only to serve this group (the synthetic
 *   supervisor, and members created through the group builder). It travels
 *   with the group on a transfer, and dies with the group on a delete or a
 *   removal from the roster.
 * - `referenced` — a standalone agent that was linked INTO the group. Its life
 *   is its own: leaving the roster only drops the link, deleting the group
 *   leaves it untouched, and a group transfer must not drag it into another
 *   scope (a clone is made there instead).
 */
export const GROUP_MEMBERSHIP_TYPES = ['owned', 'referenced'] as const;

export type GroupMembershipType = (typeof GROUP_MEMBERSHIP_TYPES)[number];

/** Conversation role is independent from the Agent's lifecycle ownership. */
export const GROUP_MEMBER_ROLES = ['supervisor', 'participant', 'assistant'] as const;

export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

export const GROUP_SUPERVISOR_ROLE = 'supervisor';

interface GroupMembershipSource {
  /** `chat_groups_agents.role` of the membership row. */
  role?: string | null;
  /**
   * `agents.slug` of the member agent. Pass it wherever the read has it: a
   * reserved builtin slug forces `referenced`, so no owned path can delete or
   * rehome someone's Inbox.
   */
  slug?: string | null;
  /** `agents.virtual` of the member agent. */
  virtual?: boolean | null;
}

/** Shared coordinator Agents remain referenced; actual legacy virtual members remain owned. */
export const resolveGroupMembershipType = (
  membership: GroupMembershipSource,
): GroupMembershipType => {
  // Builtins belong to their provisioning lifecycle, never to a Group.
  if (membership.slug && RESERVED_BUILTIN_AGENT_SLUGS.includes(membership.slug)) {
    return 'referenced';
  }

  return membership.virtual ? 'owned' : 'referenced';
};

/** SQL counterpart used by Group cleanup. Requires the Agent row to be joined. */
export const isOwnedMembership = (): SQL =>
  and(
    eq(agents.virtual, true),
    // Mirrors the builtin carve-out above. A NULL slug predates slug
    // generation and is not a builtin; `NOT IN` alone would evaluate to NULL
    // and drop those rows from the owned set.
    or(isNull(agents.slug), notInArray(agents.slug, RESERVED_BUILTIN_AGENT_SLUGS)),
  )!;
