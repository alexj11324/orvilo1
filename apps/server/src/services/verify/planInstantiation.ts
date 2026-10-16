import type { OrviloDatabase } from '@/database/type';

export interface InstantiateVerifyPlanParams {
  operationId: string;
  taskId: string;
}

/** Retired callback: old persisted completions must not recreate Verify plans. */
export const instantiateVerifyPlanOnStart = async (
  _db: OrviloDatabase,
  _userId: string,
  _params: InstantiateVerifyPlanParams,
  _workspaceId?: string,
): Promise<void> => {};
