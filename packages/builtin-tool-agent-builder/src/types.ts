import type { MetaData, OrviloAgentConfig } from '@orvilo/types';
import type { PartialDeep } from 'type-fest';

/**
 * Agent Builder Tool Identifier
 */
export const AgentBuilderIdentifier = 'orvilo-agent-builder';

/**
 * Agent Builder API Names
 */
export const AgentBuilderApiName = {
  // Read operations
  // Note: getAgentConfig, getAgentMeta, getPrompt, getAvailableTools, searchOfficialTools are removed
  // because the current agent context is now automatically injected
  getAvailableModels: 'getAvailableModels',
  // Write operations
  // Note: setModel, setOpeningMessage, setOpeningQuestions, updateChatConfig, updateAgentMeta, togglePlugin are removed
  // and consolidated into updateAgentConfig
  updateAgentConfig: 'updateConfig',
  updatePrompt: 'updatePrompt',
} as const;

export type AgentBuilderApiNameType =
  (typeof AgentBuilderApiName)[keyof typeof AgentBuilderApiName];

// ============== Parameter Types ==============

export interface UpdateAgentConfigParams {
  /**
   * Partial agent configuration to update
   */
  config?: PartialDeep<OrviloAgentConfig>;
  /**
   * Partial metadata to update
   */
  meta?: Partial<MetaData>;
  /**
   * Plugin toggle operation - will be merged into config.plugins
   */
  togglePlugin?: {
    /**
     * Whether to enable the plugin. If not provided, toggles current state.
     */
    enabled?: boolean;
    /**
     * The plugin identifier to toggle
     */
    pluginId: string;
  };
}

export interface GetAvailableModelsParams {
  /**
   * Optional: filter by provider id
   */
  providerId?: string;
}

export interface UpdatePromptParams {
  /**
   * The new system prompt content (markdown format)
   */
  prompt: string;
  /**
   * Whether to use streaming mode for typewriter effect
   */
  streaming?: boolean;
}

// ============== State Types (for Render components) ==============

export interface UpdateConfigState {
  /** Stable target captured by the mutation invocation. */
  agentId?: string;
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

export interface UpdatePromptState {
  /** Stable target captured by the mutation invocation. */
  agentId?: string;
  newPrompt: string;
  previousPrompt?: string;
  success: boolean;
}
