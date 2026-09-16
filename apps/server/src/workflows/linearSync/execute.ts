import type { PublicServeOptions, WorkflowContext } from '@upstash/workflow';

import { LinearSyncModel } from '@/database/models/linearSync';
import { getServerDB } from '@/database/server';
import { LinearPlanningWorker } from '@/server/services/linearSync/planning';
import { createLinearGraphqlIssueProvider } from '@/server/services/linearSync/provider';
import { LinearSyncWorker } from '@/server/services/linearSync/worker';

import {
  type LinearSyncInstallationResult,
  type LinearSyncWorkflowPayload,
  LinearSyncWorkflowPayloadSchema,
} from './types';

type LinearExecuteContext = Pick<
  WorkflowContext<LinearSyncWorkflowPayload>,
  'requestPayload' | 'run'
>;

/** Layer 3: process one installation with bounded, leased workers. */
export const executeLinearSyncWorkflow = async (
  context: LinearExecuteContext,
): Promise<LinearSyncInstallationResult> => {
  const payload = LinearSyncWorkflowPayloadSchema.parse(context.requestPayload);
  if (!payload.installationId) throw new Error('Linear sync installationId is required');

  const db = await getServerDB();
  const model = new LinearSyncModel(db, payload.workspaceId);
  const installation = await context.run('linear-sync:load-installation', () =>
    model.findInstallationById(payload.installationId!),
  );
  if (!installation) throw new Error('Linear installation not found');
  if (installation.status !== 'active') {
    return {
      installationId: installation.id,
      inbox: { failed: 0, imported: 0, pendingBinding: 0, processed: 0 },
      outbox: { failed: 0, sent: 0 },
      planning: { failed: 0, processed: 0, proposed: 0 },
    };
  }
  if (!installation.installedByUserId) throw new Error('Linear installation has no active owner');

  const provider = createLinearGraphqlIssueProvider({
    userId: installation.installedByUserId,
    workspaceId: payload.workspaceId,
  });
  const syncWorker = new LinearSyncWorker(db, payload.workspaceId);
  const inbox = await context.run('linear-sync:process-inbox', () =>
    syncWorker.processPending(provider, payload.limit, installation.id),
  );
  const outbox = await context.run('linear-sync:process-outbox', () =>
    syncWorker.processOutbox(provider, payload.limit, installation.id),
  );
  const planning = await context.run('linear-sync:process-planning', () =>
    new LinearPlanningWorker(db, payload.workspaceId).processPending(undefined, payload.limit),
  );

  return { installationId: installation.id, inbox, outbox, planning };
};

export const executeLinearSyncWorkflowOptions = {
  initialPayloadParser: (input: string) => LinearSyncWorkflowPayloadSchema.parse(JSON.parse(input)),
} satisfies PublicServeOptions<LinearSyncWorkflowPayload>;
