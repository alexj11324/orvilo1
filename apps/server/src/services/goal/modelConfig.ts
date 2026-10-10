import type { OrviloDatabase } from '@/database/type';
import { resolveOwnedSystemAgentModelConfig } from '@/server/services/systemAgent/ownedModelConfig';

export const resolveGoalModelConfig = (
  db: OrviloDatabase,
  userId: string,
  agentId?: string | null,
  workspaceId?: string,
) => resolveOwnedSystemAgentModelConfig(db, userId, 'goal', agentId, workspaceId);
