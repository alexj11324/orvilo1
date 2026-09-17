import { LinearSyncModel } from '@/database/models/linearSync';
import { getServerDB } from '@/database/server';
import type { WorkflowContext } from '@/server/workflows/context';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';

import {
  type LinearSyncWorkflowPayload,
  LinearSyncWorkflowPayloadSchema,
  type LinearSyncWorkflowResult,
} from './types';

type LinearProcessContext = Pick<
  WorkflowContext<LinearSyncWorkflowPayload>,
  'requestPayload' | 'run'
>;

/** Layer 1: enumerate durable installations and fan out one execution per installation. */
export const processLinearSyncWorkflow = async (
  context: LinearProcessContext,
): Promise<LinearSyncWorkflowResult> => {
  const payload = LinearSyncWorkflowPayloadSchema.parse(context.requestPayload);
  const db = await getServerDB();
  const model = new LinearSyncModel(db, payload.workspaceId);
  const installations = await context.run('linear-sync:list-installations', () =>
    model.listInstallations(),
  );
  const selected = installations.filter(
    (installation) =>
      (!payload.installationId || installation.id === payload.installationId) &&
      installation.status === 'active',
  );

  if (payload.dryRun) {
    return { dryRun: true, installations: selected.length, scheduled: 0 };
  }

  await Promise.all(
    selected.map((installation) =>
      context.run(`linear-sync:schedule:${installation.id}`, () =>
        LinearSyncWorkflow.triggerInstallation({
          ...payload,
          installationId: installation.id,
        }),
      ),
    ),
  );

  return { dryRun: false, installations: selected.length, scheduled: selected.length };
};
