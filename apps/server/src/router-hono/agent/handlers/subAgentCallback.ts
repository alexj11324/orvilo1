import debug from 'debug';
import type { Context } from 'hono';

import { getServerDB } from '@/database/core/db-adaptor';
import { createAgentStateManager } from '@/server/modules/AgentExecution/factory';
import { AiAgentService } from '@/server/services/aiAgent';

const log = debug('orvilo-server:agent:subagent-callback');

/**
 * Sub-agent completion bridge webhook (queue mode).
 *
 * When a server sub-agent op — spawned by a parent parked on `callSubAgent` —
 * reaches a terminal state, its `onComplete` hook is delivered here by Hatchet
 * (in-memory handler hooks don't survive queue mode's cross-process steps).
 * Backfills the parent's placeholder tool message and barrier-resumes the
 * parked parent op via `completeSubAgentBridge`.
 *
 * Body: `{ operationId, reason, parentOperationId, threadId, toolMessageId }`
 * — event fields from the hook dispatch plus the bridge params from
 * `webhook.body`.
 *
 */
export async function subAgentCallback(c: Context): Promise<Response> {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { operationId, parentOperationId, reason, threadId, toolMessageId } = body;

  log(
    'subagent-callback: operationId=%s, parentOperationId=%s, reason=%s, toolMessageId=%s',
    operationId,
    parentOperationId,
    reason,
    toolMessageId,
  );

  if (!operationId || !parentOperationId || !toolMessageId) {
    return c.json(
      { error: 'Missing required fields: operationId, parentOperationId, toolMessageId' },
      400,
    );
  }

  try {
    // Resolve userId from the child operation metadata. The worker supplies
    // only internal dispatch payloads, and the operation must exist.
    const metadata = await createAgentStateManager().getOperationMetadata(operationId);

    if (!metadata?.userId) {
      log('subagent-callback: invalid operation or no userId found for %s', operationId);
      return c.json({ error: 'Invalid operation or unauthorized' }, 401);
    }

    const serverDB = await getServerDB();
    // Bridge through AiAgentService (like the /run step worker) so the
    // runtime's models stay workspace-scoped — a bare AgentRuntimeService
    // would be personal-scoped and the tool-message backfill / resume
    // barrier could miss workspace-scoped rows.
    // Opt into visitor rows only for shared-agent visitor runs: metadata
    // carries `streamOwnerUserId` when the operation executes as the creator
    // but the visitor owns the stream. Ordinary creator ops keep the default
    // exclusion.
    const includeShareVisitor = Boolean(metadata.streamOwnerUserId);
    const aiAgentService = new AiAgentService(serverDB, metadata.userId, {
      includeShareVisitor,
      workspaceId: metadata.workspaceId,
    });

    const resumed = await aiAgentService.completeSubAgentBridge({
      operationId,
      parentOperationId,
      reason: reason ?? 'done',
      threadId: threadId ?? '',
      toolMessageId,
    });

    return c.json({ operationId, parentOperationId, resumed, success: true });
  } catch (error) {
    console.error('subagent-callback error:', error);
    // Surface failures so Hatchet retries transient DB/Redis failures.
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
