import { ENABLE_BUSINESS_FEATURES } from '@orvilo/business-const';
import { TRPCError } from '@trpc/server';

/**
 * Existing shares remain accessible regardless of a visitor's rollout flags.
 * Deployment support is still enforced before resolving any shared data.
 */
export const assertAgentShareVisitorEnabled = () => {
  if (!ENABLE_BUSINESS_FEATURES) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Agent sharing is not available on this deployment',
    });
  }
};

/**
 * Publishing an agent to external visitors is retired: an agent can no longer be
 * shared for visitors to run, and a published agent can no longer be run by one.
 *
 * The refusal is unconditional by design — there is deliberately no flag read
 * here. A persisted feature flag, an older client, or a still-valid visitor
 * token must not be able to re-open the capability, so no branch exists for one
 * to turn on. Flipping this back is a product decision that re-introduces the
 * capability, not a configuration change.
 *
 * What still works, and must keep working:
 * - Read paths for existing shares (`share.getSharedAgent`, `shareChat.getTopics`
 *   and `getMessages`) stay open, so an owner can still review and revoke, and an
 *   old link can resolve to a page that explains itself instead of a raw error.
 * - `agentShare.disableShare` and `updateVisibility` to a non-link visibility stay
 *   open, so owners can take a share down.
 * - `shareChat.interruptTask` and the gateway-token procedures stay open, so a run
 *   that is already in flight can finish or be cancelled and its artifacts and
 *   cost are not lost.
 */
const refusalNote =
  'External visitor access to agents has been retired. Existing shares can still be reviewed and revoked.';

/**
 * Gates every path that publishes an agent to visitors or re-enables an existing
 * share (`agentShare.enableShare`, `agentShare.updateVisibility` to `link`).
 *
 * `never` return type is the type-level statement of "no flag/token branch":
 * callers can rely on control flow ending here rather than on a sentinel.
 */
export const assertAgentShareCreationEnabled = (): never => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Publishing an agent to external visitors is no longer available. ${refusalNote}`,
  });
};

/**
 * Gates the only entry point that ever started a visitor run
 * (`shareChat.execAgent`).
 *
 * This is a complete choke point rather than one of several: `execAgent` was
 * the sole procedure that could authorize a run on a visitor topic, and its
 * body is now exactly this refusal — nothing is resolved, spend-checked, or
 * written first. Defense in depth backs it up for non-visitor callers:
 * `turnSetup` fails closed on any `senderId`-marked topic reached through a
 * generic `AiAgentService.execAgent` call (a leaked topicId, a scheduled
 * retry), and the scheduled-run dispatcher drops visitor-topic schedules
 * before claiming. A stale client, a still-valid visitor token, or a parked
 * continuation therefore cannot start a new visitor run either.
 *
 * Refusing here also refuses everything a NEW run could do — streaming input,
 * continue-generation, async dispatch and tool calls are all downstream of a
 * run that cannot start. Runs persisted BEFORE retirement keep their own
 * `agentShareVisitor` marker and per-step revalidation, and finish or cancel
 * through the retained lifecycle paths.
 */
export const assertAgentShareVisitorExecutionEnabled = (): never => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Running a shared agent as a visitor is no longer available. ${refusalNote}`,
  });
};
