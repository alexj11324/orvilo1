import type { OrviloDatabase } from '@/database/type';
import { resolveOwnedSystemAgentModelConfig } from '@/server/services/systemAgent/ownedModelConfig';

export const resolveExpertiseModelConfig = (
  db: OrviloDatabase,
  userId: string,
  agentId?: string | null,
  workspaceId?: string,
) => resolveOwnedSystemAgentModelConfig(db, userId, 'expertise', agentId, workspaceId);
