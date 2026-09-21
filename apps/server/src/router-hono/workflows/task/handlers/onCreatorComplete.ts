import debug from 'debug';
import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { TaskResultBridgeService } from '@/server/services/taskResultBridge';
import { TaskResultCallbackRedisStore } from '@/server/services/taskResultBridge/redisStore';

const log = debug('orvilo-server:workflows:task:on-creator-complete');

interface OnCreatorCompletePayload {
  agentId: string;
  operationId: string;
  originTopicId: string;
  receiptIds: string[];
  userId: string;
  workspaceId?: string;
}

export async function onCreatorComplete(c: Context) {
  try {
    const body = (await c.req.json()) as OnCreatorCompletePayload;
    if (
      !body.agentId ||
      !body.operationId ||
      !body.originTopicId ||
      !body.userId ||
      !Array.isArray(body.receiptIds)
    ) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const db = await getServerDB();
    const callbackStore = new TaskResultCallbackRedisStore(
      body.userId,
      body.originTopicId,
      body.workspaceId,
    );
    if (await callbackStore.areDelivered(body.receiptIds)) {
      return c.json({ deduped: true, success: true });
    }
    await new TaskResultBridgeService(db, body.userId, body.workspaceId).completeCreatorWakeup({
      agentId: body.agentId,
      originTopicId: body.originTopicId,
      receiptIds: body.receiptIds,
    });
    log('settled creator operation=%s receipts=%d', body.operationId, body.receiptIds.length);
    return c.json({ success: true });
  } catch (error) {
    console.error('[task/on-creator-complete] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
