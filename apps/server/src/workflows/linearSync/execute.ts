import { LinearSyncModel } from '@/database/models/linearSync';
import { getServerDB } from '@/database/server';
import { LinearPlanningWorker } from '@/server/services/linearSync/planning';
import { createLinearGraphqlIssueProvider } from '@/server/services/linearSync/provider';
import { LinearSyncWorker } from '@/server/services/linearSync/worker';
import type { WorkflowContext } from '@/server/workflows/context';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';
import { parseWorkflowDate, runStep } from '@/server/workflows/step';

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
      continuationScheduled: false,
      inbox: { failed: 0, imported: 0, pendingBinding: 0, processed: 0 },
      nextWakeAt: null,
      outbox: { failed: 0, sent: 0 },
      planning: { failed: 0, processed: 0, proposed: 0 },
    };
  }
  const provider = createLinearGraphqlIssueProvider({
    db,
    installationId: installation.id,
    organizationId: installation.organizationId,
    workspaceId: payload.workspaceId,
  });
  const syncWorker = new LinearSyncWorker(db, payload.workspaceId);
  const scope = await context.run('linear-sync:load-scope', () =>
    model.findScopeByInstallation(installation.id),
  );
  let scopeImport: LinearSyncInstallationResult['scopeImport'] = null;
  if (scope && scope.status === 'importing' && scope.importPhase !== 'completed') {
    scopeImport = await context.run('linear-sync:import-scope', () =>
      syncWorker.importScope(provider, scope.id, payload.limit),
    );
  }
  const inbox = await context.run('linear-sync:process-inbox', () =>
    syncWorker.processPending(provider, payload.limit, installation.id),
  );
  const outbox = await context.run('linear-sync:process-outbox', () =>
    syncWorker.processOutbox(provider, payload.limit, installation.id),
  );
  const planning = await context.run('linear-sync:process-planning', () =>
    new LinearPlanningWorker(db, payload.workspaceId).processPending(undefined, payload.limit),
  );
  const nextWakeAt = await runStep(context, 'linear-sync:next-wake-at', () =>
    model.nextSyncWakeAt(installation.id),
  );
  const scopeImportPending = Boolean(scopeImport && !scopeImport.completed);
  if (nextWakeAt || scopeImportPending) {
    // While a workspace import is in flight the stepper drives its own
    // continuation — queue rows may have nothing due for a long time.
    const nextWakeDate = nextWakeAt ? parseWorkflowDate(nextWakeAt) : new Date(Date.now() + 2_000);
    const delay = Math.max(0, Math.ceil((nextWakeDate.getTime() - Date.now()) / 1000));
    await context.run('linear-sync:schedule-continuation', () =>
      LinearSyncWorkflow.triggerInstallation(
        { ...payload, installationId: installation.id },
        {
          delay,
          workflowRunId: `linear-sync:${installation.id}:${nextWakeDate.toISOString()}`,
        },
      ),
    );
  }

  return {
    continuationScheduled: Boolean(nextWakeAt) || scopeImportPending,
    inbox,
    installationId: installation.id,
    nextWakeAt: nextWakeAt ? parseWorkflowDate(nextWakeAt).toISOString() : null,
    outbox,
    planning,
    scopeImport,
  };
};
