import type {
  SkillItem,
  SkillListItem,
  SkillResourceContent,
  SkillResourceTreeNode,
  SkillSource,
} from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

/**
 * Client for the platform skill read API.
 *
 * The create / import / update / delete half of this service was the Skill
 * management product chain, which is retired — see
 * `docs/development/hidden-surface-retirement.md`. What remains is the read
 * surface the agent runtime needs to resolve the skills a user already has
 * (`skillEngineering`, `skillPreload`, the `orvilo-skills` executors and the
 * desktop skill runtime).
 */
class AgentSkillService {
  // ===== Query =====

  async getById(id: string): Promise<SkillItem | undefined> {
    return lambdaClient.agentSkills.getById.query({ id });
  }

  async getZipUrl(id: string): Promise<{ name: string; url: string | null }> {
    return lambdaClient.agentSkills.getByIdWithZipUrl.query({ id });
  }

  async getByIdentifier(identifier: string): Promise<SkillItem | undefined> {
    return lambdaClient.agentSkills.getByIdentifier.query({ identifier });
  }

  async getByName(name: string): Promise<SkillItem | undefined> {
    return lambdaClient.agentSkills.getByName.query({ name });
  }

  async list(source?: SkillSource): Promise<{ data: SkillListItem[]; total: number }> {
    return lambdaClient.agentSkills.list.query(source ? { source } : undefined);
  }

  async search(query: string): Promise<{ data: SkillListItem[]; total: number }> {
    return lambdaClient.agentSkills.search.query({ query });
  }

  // ===== Resources =====

  async listResources(id: string, includeContent?: boolean): Promise<SkillResourceTreeNode[]> {
    return lambdaClient.agentSkills.listResources.query({ id, includeContent });
  }

  async readResource(id: string, path: string): Promise<SkillResourceContent> {
    return lambdaClient.agentSkills.readResource.query({ id, path });
  }
}

export const agentSkillService = new AgentSkillService();
