export interface SystemAgentItem {
  contextLimit?: number;
  customPrompt?: string;
  enabled?: boolean;
  model: string;
  provider: string;
}

export interface UserSystemAgentConfig {
  /** Model used to draft expertise domains and extract reusable experience from conversations. */
  expertise: SystemAgentItem;
  /** Model used to turn a persistent goal into its standing acceptance criteria. */
  goal: SystemAgentItem;
  /** Model used to turn onboarding evidence into background-safe task recommendations. */
  onboardingTaskRecommender: SystemAgentItem;
  /** Model used to synthesize connector evidence into the onboarding understanding. */
  onboardingUnderstanding: SystemAgentItem;
  thread: SystemAgentItem;
}

export interface UserMemoryServiceModelConfig {
  memoryAnalysisAgentConfig: SystemAgentItem;
  userMemoryEmbedding: SystemAgentItem;
  userMemoryPersonaWriter: SystemAgentItem;
}

export interface UserServiceModelConfig
  extends UserSystemAgentConfig, UserMemoryServiceModelConfig {}

export type UserSystemAgentConfigKey = keyof UserSystemAgentConfig;
export type UserMemoryServiceModelConfigKey = keyof UserMemoryServiceModelConfig;
export type UserServiceModelConfigKey = keyof UserServiceModelConfig;
