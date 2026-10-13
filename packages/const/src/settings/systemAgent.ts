import {
  DEFAULT_EMBEDDING_PROVIDER,
  DEFAULT_MINI_PROVIDER,
  DEFAULT_PROVIDER,
} from '@orvilo/business-const';
import type { SystemAgentItem, UserServiceModelConfig } from '@orvilo/types';

import { DEFAULT_EMBEDDING_MODEL, DEFAULT_MINI_MODEL, DEFAULT_MODEL } from './llm';

export const DEFAULT_SYSTEM_AGENT_ITEM: SystemAgentItem = {
  model: DEFAULT_MODEL,
  provider: DEFAULT_PROVIDER,
};

export const DEFAULT_MINI_SYSTEM_AGENT_ITEM: SystemAgentItem = {
  model: DEFAULT_MINI_MODEL,
  provider: DEFAULT_MINI_PROVIDER,
};

export const DEFAULT_USER_MEMORY_EMBEDDING_SYSTEM_AGENT_ITEM: SystemAgentItem = {
  model: DEFAULT_EMBEDDING_MODEL,
  provider: DEFAULT_EMBEDDING_PROVIDER,
};

export const DEFAULT_SYSTEM_AGENT_CONFIG: UserServiceModelConfig = {
  expertise: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  orchestrationWorkflow: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  memoryAnalysisAgentConfig: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  onboardingTaskRecommender: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  onboardingUnderstanding: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  userMemoryEmbedding: DEFAULT_USER_MEMORY_EMBEDDING_SYSTEM_AGENT_ITEM,
  userMemoryPersonaWriter: DEFAULT_MINI_SYSTEM_AGENT_ITEM,
  thread: DEFAULT_SYSTEM_AGENT_ITEM,
};
