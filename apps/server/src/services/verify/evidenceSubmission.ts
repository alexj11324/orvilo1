import type { VerifyCheckItem } from '@orvilo/types';

import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyEvidenceModel } from '@/database/models/verifyEvidence';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { AgentOperationItem } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';

/** Preserve the builder's delivery as evidence alongside its submitted artifacts. */
export const recordHeterogeneousDeliverableEvidence = async (params: {
  db: OrviloDatabase;
  deliverable: string;
  operation: AgentOperationItem;
  plan: VerifyCheckItem[];
  userId: string;
  workspaceId?: string;
}) => {
  const { db, deliverable, operation, plan, userId, workspaceId } = params;
  const run = await new VerifyRunModel(db, userId, workspaceId).findByOperation(operation.id);
  if (!run) throw new Error('Verification run is missing for heterogeneous evidence');

  for (const item of plan) {
    const result = await new VerifyCheckResultModel(db, userId, workspaceId).upsertByCheckItem({
      checkItemId: item.id,
      checkItemIndex: item.index,
      checkItemTitle: item.title,
      operationId: operation.id,
      required: item.required,
      verifierType: item.verifierType,
      verifyRunId: run.id,
    });
    await new VerifyEvidenceModel(db, userId, workspaceId).createMany([
      {
        capturedAt: new Date(),
        capturedBy: 'agent',
        checkResultId: result.id,
        content: deliverable,
        description: 'Final deliverable reported by the builder.',
        documentId: null,
        fileId: null,
        type: 'text',
      },
    ]);
  }
};
