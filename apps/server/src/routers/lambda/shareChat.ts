import { SHARE_VISITOR_PROMPT_MAX_LENGTH } from '@orvilo/const';
import type { ChatMessageError, ExecAgentResult } from '@orvilo/types';
import { entityIdPattern } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { z } from 'zod';

import { AgentShareModel } from '@/database/models/agentShare';
import { MessageModel, sanitizeVisitorError } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import type { OrviloDatabase } from '@/database/type';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { signUserJWT } from '@/libs/trpc/utils/internalJwt';
import { AiAgentService } from '@/server/services/aiAgent';
import { FileService } from '@/server/services/file';

import {
  assertAgentShareVisitorEnabled,
  assertAgentShareVisitorExecutionEnabled,
} from './_helpers/agentShareFeatureGate';

const log = debug('orvilo-server:router:shareChat');

/**
 * Visitor-facing lifecycle surface for shared agents (Agent Share).
 *
 * Visitor EXECUTION is retired — `execAgent` refuses unconditionally — so
 * what remains serves the visitor topics/runs persisted while execution
 * existed: transcript reads, interrupting a still-running operation, and the
 * gateway tokens those streams authenticate under.
 *
 * All procedures authenticate the VISITOR (ctx.userId) but operate on
 * CREATOR-owned rows: topics/messages of a share conversation carry the
 * creator's userId (so runtime, billing, and tool paths behave exactly as a
 * creator-owned chat) plus `topics.senderId = visitor` for scoping. Every
 * read/write here is therefore manually authorized: resolve the share via
 * {@link resolveLinkShareOrThrow}, then require
 * `topic.senderId === visitor && topic.agentId === share.agentId`
 * ({@link findVisitorTopicOrThrow}).
 *
 * There is no share-instance column on `topics`: a visitor topic is tied to
 * its share purely through `(agentId, senderId)`, which is unambiguous because
 * `agent_shares` is 1:1 per agent. A visitor's own older topics resurface
 * after an owner disables and re-enables the share — that crosses no identity
 * boundary (it is the same visitor's own prior conversation with the same
 * agent).
 *
 * Agent sharing is personal-only (workspace agents cannot be shared), so no
 * workspaceId is ever threaded into the creator-scoped models/services.
 */
const shareChatProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  // Visitor access depends on deployment support and share permissions,
  // not the publishing rollout flag.
  assertAgentShareVisitorEnabled();

  return opts.next();
});

const ShareTopicScopeSchema = z.object({
  shareId: z.string(),
  topicId: z.string(),
});

/**
 * Resolve a share for the VISITOR execution path.
 *
 * Stricter than the plain `findByShareIdWithAccessCheck` used by the read-only
 * share page: that helper deliberately lets the OWNER through on a `private`
 * share (so they can preview their own unpublished page), but the owner never
 * uses this visitor chain — they chat with their own agent through
 * `aiAgent.execAgent`. Requiring `link` here keeps this entry point in exact
 * agreement with the per-step revalidation
 * (`AgentShareModel.isRunStillAuthorized`, which also demands `link`), so a
 * run can never be authorized to start under a rule its own step loop would
 * immediately abort it for.
 */
const resolveLinkShareOrThrow = async (
  db: OrviloDatabase,
  shareId: string,
  viewerId: string,
) => {
  const share = await AgentShareModel.findByShareIdWithAccessCheck(db, shareId, viewerId);

  if (share.visibility !== 'link') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This share is private' });
  }

  return share;
};

/**
 * Resolve a visitor-owned share topic or fail closed. The topic row belongs to
 * the creator (creator-scoped TopicModel), so the senderId + agentId match is
 * the ONLY thing standing between a visitor and the creator's other topics.
 */
const findVisitorTopicOrThrow = async (
  topicModel: TopicModel,
  params: { agentId: string; topicId: string; visitorUserId: string },
) => {
  const topic = await topicModel.findById(params.topicId);

  if (!topic || topic.senderId !== params.visitorUserId || topic.agentId !== params.agentId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Topic not found' });
  }

  return topic;
};

/**
 * Convert an internal startup failure into a visitor-safe `TRPCError` — reuses
 * `sanitizeVisitorError` (`packages/database/src/models/message.ts`) instead of
 * a third ad-hoc redaction. `interruptTask` can throw BEFORE any Gateway
 * streaming starts (e.g. the queue or runtime backend returns a diagnostic),
 * a failure surface neither existing visitor projection covers —
 * `toVisitorMessage` only runs over persisted rows and the Gateway event
 * sanitizer only runs over live stream events — so without this, the raw
 * `error.message` (which can carry the creator's provider/infra diagnostic,
 * since the run executes under the CREATOR's identity) went straight to the
 * visitor. Logs the raw error server-side and returns only the classified
 * `{ type }` (or `{ message }` for the narrow allowlisted codes) that
 * `sanitizeVisitorError` already deems visitor-safe.
 *
 * `showErrorDetails` (the owner's opt-in on the share config) bypasses the
 * projection, exactly as it does for persisted rows and live stream events.
 */
const toVisitorSafeStartupError = (
  context: string,
  error: unknown,
  options: { showErrorDetails?: boolean } = {},
): TRPCError => {
  log('%s failed: %O', context, error);

  const raw = error as { message?: unknown; type?: unknown } | null | undefined;
  const safe = sanitizeVisitorError(
    raw && typeof raw === 'object'
      ? ({
          message: typeof raw.message === 'string' ? raw.message : undefined,
          type: raw.type,
        } as ChatMessageError)
      : undefined,
    options,
  );

  // `type` widens to `string | number` (the numeric HTTP-status error codes),
  // while `TRPCError.message` is `string | undefined` — stringify rather than
  // drop the numeric codes, which are exactly as visitor-safe as the rest.
  const publicMessage = safe?.message ?? safe?.type;

  return new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: publicMessage === undefined ? 'Internal error' : String(publicMessage),
  });
};

export const shareChatRouter = router({
  /**
   * Execute a shared agent as a visitor — RETIRED.
   *
   * The procedure and its input schema stay so a stale client or a still-valid
   * visitor token reaches a clean refusal rather than a parse error. The
   * refusal runs before anything is resolved, spend-checked, or written, so no
   * topic/message/runtime row can be created by this path. See
   * `assertAgentShareVisitorExecutionEnabled`'s JSDoc for why this is a
   * complete choke point.
   */
  execAgent: shareChatProcedure
    .input(
      z.object({
        /** Client-minted row ids, honoured verbatim (see aiAgent.execAgent). */
        clientIds: z
          .object({
            assistantMessageId: z.string().regex(entityIdPattern('messages')).optional(),
            topicId: z.string().regex(entityIdPattern('topics')).optional(),
            userMessageId: z.string().regex(entityIdPattern('messages')).optional(),
          })
          .optional(),
        /** See `SHARE_VISITOR_PROMPT_MAX_LENGTH`'s JSDoc for the size-bound rationale. */
        prompt: z.string().max(SHARE_VISITOR_PROMPT_MAX_LENGTH),
        shareId: z.string(),
        /** Retired field — kept only so stale clients pass schema validation. */
        topicId: z.string().nullish(),
      }),
    )
    .mutation(async (): Promise<ExecAgentResult> => {
      // `never`-typed: control flow provably ends here. The `return` of a
      // `never` value satisfies the declared `Promise<ExecAgentResult>` under
      // every checker, and the annotation keeps the procedure's pre-retirement
      // output contract so a stale client's `ExecAgentResult` handling still
      // type-checks.
      return assertAgentShareVisitorExecutionEnabled();
    }),

  /** Messages of one visitor-owned share topic. */
  getMessages: shareChatProcedure.input(ShareTopicScopeSchema).query(async ({ input, ctx }) => {
    const share = await resolveLinkShareOrThrow(ctx.serverDB, input.shareId, ctx.userId);

    const topicModel = new TopicModel(ctx.serverDB, share.ownerId, undefined, undefined, {
      includeShareVisitor: true,
    });
    await findVisitorTopicOrThrow(topicModel, {
      agentId: share.agentId,
      topicId: input.topicId,
      visitorUserId: ctx.userId,
    });

    const messageModel = new MessageModel(ctx.serverDB, share.ownerId, undefined, undefined, {
      includeShareVisitor: true,
    });
    const fileService = new FileService(ctx.serverDB, share.ownerId);

    // queryForVisitor strips the creator's `sender` identity, and — unless the
    // share opts in via `showModelInfo` / `showErrorDetails` — the spend/model
    // snapshot and raw error payload too. Share messages persist under the
    // CREATOR's account (see the module doc above), so the raw `query()` result
    // would otherwise leak the creator's account identity to the visitor.
    return messageModel.queryForVisitor(
      // skipWorks: Work summaries join live task/version state of the CREATOR's
      // account — never serve them to a visitor surface.
      { skipWorks: true, topicId: input.topicId },
      {
        postProcessUrl: (path, file) => fileService.getFileAccessUrl({ id: file.id, url: path }),
        redaction: {
          showErrorDetails: share.shareConfig.showErrorDetails,
          showModelInfo: share.shareConfig.showModelInfo,
        },
      },
    );
  }),

  /** The visitor's own topics on this shared agent. */
  getTopics: shareChatProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const share = await resolveLinkShareOrThrow(ctx.serverDB, input.shareId, ctx.userId);

      // The list is intentionally NOT bounded by the share's
      // `maxTopicsPerVisitor`: that cap gated admission of new topics back when
      // visitor execution existed, and a creator may lower it below what a
      // visitor already created. Tying the page size to it would hide those
      // older conversations with no pagination or deep link to reach them, so
      // the model applies its own fixed, generous list bound instead.
      const topicModel = new TopicModel(ctx.serverDB, share.ownerId, undefined, undefined, {
        includeShareVisitor: true,
      });
      return topicModel.queryBySender({
        agentId: share.agentId,
        senderId: ctx.userId,
      });
    }),

  /**
   * Interrupt a running share operation — the visitor counterpart of
   * `aiAgent.interruptTask`. Visitors have no owner-scoped access to
   * `aiAgent.interruptTask` (its models are scoped to the caller, and share
   * runs execute under the CREATOR's identity), so without this endpoint a
   * visitor's Stop / tab-close cannot reach the server: the run keeps streaming
   * and consuming the creator's budget until it finishes on its own.
   *
   * Authorization is intentionally stricter than `execAgent`/`getMessages`: it
   * is not enough that the topic belongs to this visitor — the `operationId`
   * must also match the operation CURRENTLY recorded as running on that topic.
   * Without that check a visitor could pass an arbitrary operationId
   * (topics/operations are creator-owned rows) and interrupt an unrelated run
   * on the creator's account.
   */
  interruptTask: shareChatProcedure
    .input(ShareTopicScopeSchema.extend({ operationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const share = await resolveLinkShareOrThrow(ctx.serverDB, input.shareId, ctx.userId);

      const topicModel = new TopicModel(ctx.serverDB, share.ownerId, undefined, undefined, {
        includeShareVisitor: true,
      });
      const topic = await findVisitorTopicOrThrow(topicModel, {
        agentId: share.agentId,
        topicId: input.topicId,
        visitorUserId: ctx.userId,
      });

      const runningOperationId = topic.metadata?.runningOperation?.operationId;
      if (!runningOperationId || runningOperationId !== input.operationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No matching running operation found on this topic',
        });
      }

      // Creator-scoped service — the run's operation / thread rows were
      // written under the creator's identity, so the underlying
      // `interruptTask` implementation must resolve them there.
      const aiAgentService = new AiAgentService(ctx.serverDB, share.ownerId, {
        includeShareVisitor: true,
      });

      log(
        'interruptTask: share=%s visitor=%s topic=%s operation=%s',
        input.shareId,
        ctx.userId,
        input.topicId,
        input.operationId,
      );

      try {
        return await aiAgentService.interruptTask({
          operationId: input.operationId,
          topicId: input.topicId,
        });
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;

        throw toVisitorSafeStartupError('interruptTask', error, {
          showErrorDetails: share.shareConfig.showErrorDetails,
        });
      }
    }),

  /**
   * Mint the per-VISITOR Gateway JWT for the multiplexed v2 WebSocket — the
   * visitor counterpart of `aiAgent.issueGatewayUserToken`. Same subject rule
   * as `refreshGatewayToken` (sign for the visitor: share ops register their
   * stream under `streamOwnerUserId = visitor`, and the hub keys on the JWT
   * `sub`), but without a running-operation check: the token authenticates the
   * user hub socket, and each `subscribe` is authorized per op by the gateway.
   * The share must still resolve as link-visible for this caller so a revoked
   * or private share cannot be used to open a hub socket from its page.
   */
  issueGatewayUserToken: shareChatProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      await resolveLinkShareOrThrow(ctx.serverDB, input.shareId, ctx.userId);

      const token = await signUserJWT(ctx.userId);

      return { token };
    }),

  /**
   * Refresh the Gateway WS JWT for a running share operation — the visitor
   * counterpart of `aiAgent.refreshGatewayToken` (which cannot serve visitors:
   * its TopicModel is scoped to the caller, and share topics belong to the
   * creator). Signs for the VISITOR — the gateway channel is registered under
   * their id (`streamOwnerUserId`), and a creator-signed token in the visitor's
   * browser would be creator account access.
   */
  refreshGatewayToken: shareChatProcedure
    .input(ShareTopicScopeSchema)
    .query(async ({ input, ctx }) => {
      const share = await resolveLinkShareOrThrow(ctx.serverDB, input.shareId, ctx.userId);

      const topicModel = new TopicModel(ctx.serverDB, share.ownerId, undefined, undefined, {
        includeShareVisitor: true,
      });
      const topic = await findVisitorTopicOrThrow(topicModel, {
        agentId: share.agentId,
        topicId: input.topicId,
        visitorUserId: ctx.userId,
      });

      // A present marker is not proof of a live run: it is cleared best-effort
      // at finish, so a stale one would send the visitor's browser to reconnect
      // to a finished operation, register it as "running" locally, and drop the
      // topic's fetched history as in-flight noise (a frozen skeleton list).
      // NOT_FOUND is what the client already treats as "stale marker, clear it".
      const runningOperation = topic.metadata?.runningOperation;
      if (
        !runningOperation ||
        !(await topicModel.isRunningOperationAlive(ctx.serverDB, runningOperation))
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No running operation found on this topic',
        });
      }

      const token = await signUserJWT(ctx.userId);

      return { token };
    }),
});

export type ShareChatRouter = typeof shareChatRouter;
