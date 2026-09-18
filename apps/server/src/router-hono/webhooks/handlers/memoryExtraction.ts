import type { Context } from 'hono';

import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import {
  buildWorkflowPayloadInput,
  MemoryExtractionExecutor,
  memoryExtractionPayloadSchema,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';
import { filterMemoryExtractionEnabledUsers } from '@/server/services/memory/userMemory/gate';

/**
 * Entry point for memory extraction: either schedules the Hatchet workflow or
 * runs the extraction inline, depending on the payload `mode`.
 *
 * Header auth is applied by the `memoryWebhookAuth` middleware.
 */
export const memoryExtractionWebhook = async (c: Context) => {
  const { workflowExtraHeaders } = parseMemoryExtractionConfig();

  try {
    const json = await c.req.json();
    const origin = new URL(c.req.url).origin;

    const payload = memoryExtractionPayloadSchema.parse({
      ...json,
      baseUrl: json.baseUrl || origin,
    });
    if (payload.fromDate && payload.toDate && payload.fromDate > payload.toDate) {
      return c.json({ error: '`fromDate` cannot be later than `toDate`' }, 400);
    }

    const params = normalizeMemoryExtractionPayload(payload, origin);

    // Unified production gate: explicit user targets that disabled memory are
    // dropped before anything is scheduled. A payload without userIds pages
    // the enabled-only user listing downstream.
    const { enabledUserIds, skippedUserIds } = await filterMemoryExtractionEnabledUsers(
      params.userIds,
    );
    if (params.userIds.length > 0 && enabledUserIds.length === 0) {
      return c.json(
        {
          message: 'Every target user has memory disabled; nothing scheduled.',
          skippedUserIds,
        },
        200,
      );
    }
    const gatedParams = { ...params, userId: enabledUserIds[0], userIds: enabledUserIds };

    if (params.mode === 'workflow') {
      const { workflowRunId } = await MemoryExtractionWorkflowService.triggerProcessUsers(
        buildWorkflowPayloadInput(gatedParams),
        { extraHeaders: workflowExtraHeaders },
      );

      return c.json(
        { message: 'Memory extraction scheduled via workflow.', skippedUserIds, workflowRunId },
        202,
      );
    }

    const executor = await MemoryExtractionExecutor.create();
    const result = await executor.runDirect(gatedParams);

    return c.json({ message: 'Memory extraction executed via webhook.', result }, 200);
  } catch (error) {
    console.error('[memory-extraction] failed', error);

    return c.json({ error: (error as Error).message }, 500);
  }
};
