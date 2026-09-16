import type { Context } from 'hono';

import { botCallback } from '@/server/router-hono/agent/handlers/botCallback';
import { groupMemberCallback } from '@/server/router-hono/agent/handlers/groupMemberCallback';
import { subAgentCallback } from '@/server/router-hono/agent/handlers/subAgentCallback';
import { onThreadComplete } from '@/server/router-hono/workflows/agent-eval-run/handlers/onThreadComplete';
import { onTrajectoryComplete } from '@/server/router-hono/workflows/agent-eval-run/handlers/onTrajectoryComplete';
import { onCreatorComplete } from '@/server/router-hono/workflows/task/handlers/onCreatorComplete';
import { onTopicComplete } from '@/server/router-hono/workflows/task/handlers/onTopicComplete';
import { onEvidenceComplete } from '@/server/router-hono/workflows/verify/handlers/onEvidenceComplete';
import { onVerifierComplete } from '@/server/router-hono/workflows/verify/handlers/onVerifierComplete';

type InternalWebhookHandler = (context: Context) => Promise<Response>;

const handlers = {
  '/api/agent/webhooks/bot-callback': botCallback,
  '/api/agent/webhooks/group-member-callback': groupMemberCallback,
  '/api/agent/webhooks/subagent-callback': subAgentCallback,
  '/api/workflows/agent-eval-run/on-thread-complete': onThreadComplete,
  '/api/workflows/agent-eval-run/on-trajectory-complete': onTrajectoryComplete,
  '/api/workflows/task/on-creator-complete': onCreatorComplete,
  '/api/workflows/task/on-topic-complete': onTopicComplete,
  '/api/workflows/verify/on-evidence-complete': onEvidenceComplete,
  '/api/workflows/verify/on-verifier-complete': onVerifierComplete,
} satisfies Record<string, InternalWebhookHandler>;

export type InternalWebhookPath = keyof typeof handlers;

export const isInternalWebhookPath = (path: string): path is InternalWebhookPath =>
  path in handlers;

const createContext = (payload: Record<string, unknown>): Context =>
  ({
    json: (body: unknown, status = 200, headers?: HeadersInit) =>
      Response.json(body, { headers, status }),
    req: { json: async () => payload },
  }) as unknown as Context;

/** Runs a fixed, trusted callback inside the worker without an HTTP or secret-bearing hop. */
export const deliverInternalWebhook = async (
  path: InternalWebhookPath,
  payload: Record<string, unknown>,
): Promise<void> => {
  const response = await handlers[path](createContext(payload));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Internal webhook ${path} failed with HTTP ${response.status}: ${body}`);
  }
};
