export enum RecommendedSkillType {
  Builtin = 'builtin',
  Composio = 'composio',
  Orvilo = 'orvilo',
}

export interface RecommendedSkillItem {
  id: string;
  type: RecommendedSkillType;
}

export const RECOMMENDED_SKILLS: RecommendedSkillItem[] = [
  // Builtin skills
  { id: 'orvilo-artifacts', type: RecommendedSkillType.Builtin },
  { id: 'orvilo-user-memory', type: RecommendedSkillType.Builtin },
  { id: 'orvilo-cloud-sandbox', type: RecommendedSkillType.Builtin },
  { id: 'orvilo-task', type: RecommendedSkillType.Builtin },
  { id: 'orvilo-agent-documents', type: RecommendedSkillType.Builtin },
  { id: 'orvilo-message', type: RecommendedSkillType.Builtin },
  // Opt-in chat image generation: default-installed so Tools can pin it without Skill Store first.
  { id: 'orvilo-image-generation', type: RecommendedSkillType.Builtin },
  // Orvilo skills
  { id: 'notion', type: RecommendedSkillType.Orvilo },
  { id: 'posthog', type: RecommendedSkillType.Orvilo },
  { id: 'twitter', type: RecommendedSkillType.Orvilo },
  // Composio skills
  { id: 'gmail', type: RecommendedSkillType.Composio },
  { id: 'google-drive', type: RecommendedSkillType.Composio },
  { id: 'google-calendar', type: RecommendedSkillType.Composio },
  { id: 'slack', type: RecommendedSkillType.Composio },
];
