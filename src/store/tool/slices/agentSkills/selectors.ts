import type { OrviloToolMeta, SkillListItem } from '@orvilo/types';

import type { ToolStoreState } from '../../initialState';

const getAgentSkills = (s: ToolStoreState): SkillListItem[] => s.agentSkills || [];

const getMarketAgentSkills = (s: ToolStoreState): SkillListItem[] =>
  (s.agentSkills || []).filter((skill) => skill.source === 'market');

const getUserAgentSkills = (s: ToolStoreState): SkillListItem[] =>
  (s.agentSkills || []).filter((skill) => skill.source === 'user');

const getAgentSkillByIdentifier =
  (identifier: string) =>
  (s: ToolStoreState): SkillListItem | undefined =>
    (s.agentSkills || []).find((skill) => skill.identifier === identifier);

const isAgentSkill =
  (identifier: string) =>
  (s: ToolStoreState): boolean =>
    (s.agentSkills || []).some((skill) => skill.identifier === identifier);

const agentSkillMetaList = (s: ToolStoreState): OrviloToolMeta[] =>
  (s.agentSkills || []).map((skill) => {
    const author = skill.manifest?.author;
    const authorName = typeof author === 'string' ? author : author?.name || 'User';

    return {
      author: authorName,
      identifier: skill.identifier,
      meta: {
        avatar: '🧩',
        description: skill.description ?? skill.manifest?.description ?? '',
        title: skill.name,
      },
      type: 'builtin' as const,
    };
  });

export const agentSkillsSelectors = {
  agentSkillMetaList,
  getAgentSkillByIdentifier,
  getAgentSkills,
  getMarketAgentSkills,
  getUserAgentSkills,
  isAgentSkill,
};
