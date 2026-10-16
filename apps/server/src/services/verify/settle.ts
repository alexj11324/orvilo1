import type { AgentOperationModel } from '@/database/models/agentOperation';
import type { OrviloDatabase } from '@/database/type';

import type { VerifyStatusService } from './statusService';

interface ReportContext {
  deliverable: string;
  goal: string;
  reviewerAgentId: string;
}

/** Compatibility for persisted old callbacks; Issue delivery owns current settlement. */
export const recomputeRepairAncestors = async (
  _operationModel: AgentOperationModel,
  _statusService: VerifyStatusService,
  _operationId: string,
): Promise<void> => {};

export const driveTaskFromVerify = async (
  _db: OrviloDatabase,
  _userId: string,
  _operationId: string,
  _workspaceId?: string,
  _options?: { beforeCompletion?: (tx: OrviloDatabase) => Promise<boolean> },
): Promise<void> => {};

export const finalizeVerifyRun = async (
  _db: OrviloDatabase,
  _userId: string,
  _operationId: string,
  _opts: { report?: ReportContext },
  _workspaceId?: string,
): Promise<void> => {};
