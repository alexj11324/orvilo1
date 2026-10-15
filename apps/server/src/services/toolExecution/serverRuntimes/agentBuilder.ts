import {
  AgentBuilderIdentifier,
  type GetAvailableModelsParams,
  normalizeUpdateConfigParams,
  type UpdateAgentConfigParams,
  type UpdatePromptParams,
} from '@orvilo/builtin-tool-agent-builder';
import { BRANDING_PROVIDER } from '@orvilo/business-const';
import { loadModels } from '@orvilo/business-model-bank/model-config';
import { modelsResultsPrompt } from '@orvilo/prompts';
import { getPluginMode, upsertPluginMode } from '@orvilo/types';

import { AgentModel } from '@/database/models/agent';

import { type ToolExecutionContext, type ToolExecutionResult } from '../types';
import { type ServerRuntimeRegistration } from './types';

const MAX_MODELS = 20;

const handleError = (error: unknown, message: string): ToolExecutionResult => {
  const err = error as Error;
  return { content: `${message}: ${err.message}`, success: false };
};

export const agentBuilderRuntime: ServerRuntimeRegistration = {
  factory: (context: ToolExecutionContext) => {
    if (!context.userId || !context.serverDB) {
      throw new Error('userId and serverDB are required for Agent Builder execution');
    }
    const userId = context.userId;

    const agentModel = new AgentModel(context.serverDB, userId, context.workspaceId);
    return {
      getAvailableModels: async (
        params: GetAvailableModelsParams,
      ): Promise<ToolExecutionResult> => {
        try {
          // Static builtin catalog — the user-managed provider runtime is retired.
          const { DEFAULT_MODEL_PROVIDER_LIST } = await import('model-bank/modelProviders');
          const builtinModels = await loadModels();
          const chatModels = builtinModels.filter(
            (model) => model.type === 'chat' && model.enabled,
          );

          const enabledProviders = DEFAULT_MODEL_PROVIDER_LIST.filter(
            (p) => p.enabled && chatModels.some((m) => m.providerId === p.id),
          ).map((p) => ({ id: p.id, name: p.name }));

          // Orvilo provider first, then catalog order
          enabledProviders.sort((a, b) => {
            if (a.id === BRANDING_PROVIDER) return -1;
            if (b.id === BRANDING_PROVIDER) return 1;
            return 0;
          });

          // Apply optional provider filter
          const filteredProviders = params.providerId
            ? enabledProviders.filter((p) => p.id === params.providerId)
            : enabledProviders;

          const providerResults: Array<{
            id: string;
            models: Array<{
              abilities?: {
                files?: boolean;
                functionCall?: boolean;
                reasoning?: boolean;
                vision?: boolean;
              };
              description?: string;
              id: string;
              name: string;
            }>;
            name: string;
          }> = [];

          let totalModels = 0;

          for (const provider of filteredProviders) {
            if (totalModels >= MAX_MODELS) break;

            const providerChatModels = chatModels.filter((m) => m.providerId === provider.id);

            const remaining = MAX_MODELS - totalModels;
            const sliced = providerChatModels.slice(0, remaining);

            if (sliced.length === 0) continue;

            providerResults.push({
              id: provider.id,
              models: sliced.map((m) => ({
                abilities: (m.abilities as any) ?? undefined,
                id: m.id,
                name: m.displayName || m.id,
              })),
              name: provider.name || provider.id,
            });

            totalModels += sliced.length;
          }

          const xmlContent = modelsResultsPrompt(providerResults);
          const summary = `Found ${providerResults.length} enabled provider(s) with ${totalModels} model(s).\n\n${xmlContent}`;

          return {
            content: summary,
            state: { providers: providerResults },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to get available models');
        }
      },

      updateConfig: async (
        params: UpdateAgentConfigParams,
        ctx: ToolExecutionContext,
      ): Promise<ToolExecutionResult> => {
        const agentId = ctx.editingAgentId ?? ctx.agentId;

        if (!agentId) {
          return {
            content: 'No active agent found',
            error: { message: 'No active agent found', type: 'NoAgentContext' },
            success: false,
          };
        }

        try {
          const agent = await agentModel.getAgentConfigById(agentId);
          if (!agent) {
            return { content: `Agent "${agentId}" not found.`, success: false };
          }

          const { config: rawConfig, meta: rawMeta } = normalizeUpdateConfigParams(params);

          let finalConfig = rawConfig ? { ...rawConfig } : {};
          const updatedParts: string[] = [];

          if (params.togglePlugin) {
            const { pluginId, enabled } = params.togglePlugin;
            const isEnabled = getPluginMode(agent.plugins ?? undefined, pluginId) === 'pinned';
            const shouldEnable = enabled !== undefined ? enabled : !isEnabled;

            // upsertPluginMode preserves an already-matching entry as-is and
            // flips a disabled entry back to pinned in place, instead of
            // blindly pushing a duplicate bare-string identifier.
            const newPlugins = upsertPluginMode(
              agent.plugins ?? undefined,
              pluginId,
              shouldEnable ? 'pinned' : 'auto',
            );

            finalConfig = { ...finalConfig, plugins: newPlugins };
            updatedParts.push(`plugin ${pluginId} ${shouldEnable ? 'enabled' : 'disabled'}`);
          }

          if ('systemRole' in finalConfig && !('editorData' in finalConfig)) {
            finalConfig = { ...finalConfig, editorData: null };
          }

          if (Object.keys(finalConfig).length > 0) {
            // Domain tool plugins support structured entries, while the DB
            // model's JSONB column still carries its legacy string[] annotation.
            await agentModel.updateConfig(
              agentId,
              finalConfig as unknown as Parameters<typeof agentModel.updateConfig>[1],
            );
            const nonPluginFields = Object.keys(finalConfig).filter((f) => f !== 'plugins');
            if (nonPluginFields.length > 0) {
              updatedParts.push(`config fields: ${nonPluginFields.join(', ')}`);
            }
          }

          if (rawMeta && Object.keys(rawMeta).length > 0) {
            await agentModel.update(agentId, rawMeta as Record<string, unknown>);
            updatedParts.push(`meta fields: ${Object.keys(rawMeta).join(', ')}`);
          }

          if (updatedParts.length === 0) {
            return {
              content: 'No fields to update.',
              state: { agentId, success: true },
              success: true,
            };
          }

          return {
            content: `Successfully updated agent. Updated ${updatedParts.join('; ')}`,
            state: { agentId, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to update agent config');
        }
      },

      updatePrompt: async (
        params: UpdatePromptParams,
        ctx: ToolExecutionContext,
      ): Promise<ToolExecutionResult> => {
        const agentId = ctx.editingAgentId ?? ctx.agentId;

        if (!agentId) {
          return {
            content: 'No active agent found',
            error: { message: 'No active agent found', type: 'NoAgentContext' },
            success: false,
          };
        }

        try {
          await agentModel.update(agentId, {
            editorData: null,
            systemRole: params.prompt,
          } as Record<string, unknown>);

          return {
            content: params.prompt
              ? `Successfully updated system prompt (${params.prompt.length} characters)`
              : 'Successfully cleared system prompt',
            state: { agentId, newPrompt: params.prompt, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to update prompt');
        }
      },
    };
  },
  identifier: AgentBuilderIdentifier,
};
