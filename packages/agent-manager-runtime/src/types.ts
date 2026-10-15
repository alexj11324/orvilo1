import type { HeterogeneousProviderConfig, MetaData, OrviloAgentConfig } from '@orvilo/types';
import type { PartialDeep } from 'type-fest';

// ==================== Service Interfaces ====================

/**
 * Interface for agent service operations
 * Can be implemented by client-side or server-side services
 */
export interface IAgentService {
  countAgents: (params?: { keyword?: string }) => Promise<number>;
  createAgent: (params: { config: Record<string, unknown> }) => Promise<{
    agentId?: string;
  }>;
  duplicateAgent: (agentId: string, newTitle?: string) => Promise<{ agentId: string } | null>;
  getAgentConfigById: (agentId: string) => Promise<OrviloAgentConfig | null>;
  getRuntimeForCreation: (params: {
    agentId: string;
    model?: string;
    provider?: string;
    visibility?: 'private' | 'public';
  }) => Promise<Pick<Partial<OrviloAgentConfig>, 'agencyConfig' | 'model' | 'provider'>>;
  queryAgents: (params: { keyword?: string; limit?: number; offset?: number }) => Promise<
    Array<{
      avatar?: string | null;
      backgroundColor?: string | null;
      description?: string | null;
      id: string;
      title?: string | null;
    }>
  >;
  removeAgent: (agentId: string) => Promise<unknown>;
}

/** Services required for workspace Agent operations. */
export interface AgentManagerRuntimeServices {
  agentService: IAgentService;
}

// ==================== Agent CRUD Types ====================

export interface CreateAgentParams {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  model?: string;
  openingMessage?: string;
  openingQuestions?: string[];
  plugins?: string[];
  provider?: string;
  systemRole?: string;
  tags?: string[];
  title: string;
}

export interface CreateAgentState {
  agentId?: string;
  error?: string;
  sessionId?: string;
  success: boolean;
}

export interface UpdateAgentConfigParams {
  config?: PartialDeep<OrviloAgentConfig>;
  meta?: Partial<MetaData>;
  togglePlugin?: {
    enabled?: boolean;
    pluginId: string;
  };
}

export interface UpdateAgentConfigState {
  config?: {
    newValues: Record<string, unknown>;
    previousValues: Record<string, unknown>;
    updatedFields: string[];
  };
  meta?: {
    newValues: Partial<MetaData>;
    previousValues: Partial<MetaData>;
    updatedFields: string[];
  };
  success: boolean;
  togglePlugin?: {
    enabled: boolean;
    pluginId: string;
  };
}

export interface DeleteAgentState {
  agentId: string;
  success: boolean;
}

// ==================== Search Types ====================

export interface SearchAgentParams {
  keyword?: string;
  limit?: number;
  /** Number of workspace agents to skip, for paginating beyond the per-call limit */
  offset?: number;
}

export interface AgentSearchItem {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  /**
   * Heterogeneous agent runtime type (e.g. `claude-code`, `codex`), set only when
   * the agent delegates execution to an external CLI/device runtime. Absent for
   * normal model-runtime agents.
   */
  heteroType?: HeterogeneousProviderConfig['type'];
  id: string;
  title?: string;
}

export interface SearchAgentState {
  agents: AgentSearchItem[];
  /** Whether more workspace agents exist beyond the returned page */
  hasMore?: boolean;
  keyword?: string;
  /** The offset used for this page of workspace agents */
  offset?: number;
  /** Real total of matching agents across the searched sources (not just the returned page) */
  totalCount: number;
}

// ==================== Models Types ====================

export interface GetAvailableModelsParams {
  providerId?: string;
}

export interface AvailableModel {
  abilities?: {
    files?: boolean;
    functionCall?: boolean;
    reasoning?: boolean;
    vision?: boolean;
  };
  description?: string;
  id: string;
  name: string;
}

export interface AvailableProvider {
  id: string;
  models: AvailableModel[];
  name: string;
}

export interface GetAvailableModelsState {
  providers: AvailableProvider[];
}

// ==================== Prompt Types ====================

export interface UpdatePromptParams {
  prompt: string;
  streaming?: boolean;
}

export interface UpdatePromptState {
  newPrompt: string;
  previousPrompt?: string;
  success: boolean;
}
