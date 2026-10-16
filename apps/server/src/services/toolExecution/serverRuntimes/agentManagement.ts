import {
  AgentManagementIdentifier,
  type CallAgentParams,
  type CreateAgentParams,
  type DeleteAgentParams,
  type DuplicateAgentParams,
  type GetAgentDetailParams,
  type SearchAgentParams,
  type UpdateAgentParams,
  type UpdatePromptParams,
} from '@orvilo/builtin-tool-agent-management';
import { searchAgentsResultsPrompt } from '@orvilo/prompts';
import { parsePluginEntry } from '@orvilo/types';

import { AgentModel } from '@/database/models/agent';
import {
  getResourceConfigAccess,
  redactAgentConfig,
} from '@/server/routers/lambda/_helpers/resourceConfigGuard';

import { type ToolExecutionContext, type ToolExecutionResult } from '../types';
import { type ServerRuntimeRegistration } from './types';

const handleError = (error: unknown, message: string): ToolExecutionResult => {
  const err = error as Error;
  return { content: `${message}: ${err.message}`, success: false };
};

/** Max results per searchAgent call (mirrored in the tool manifest: "max: 20") */
const MAX_SEARCH_AGENT_LIMIT = 20;

export const agentManagementRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId || !context.serverDB) {
      throw new Error('userId and serverDB are required for Agent Management execution');
    }

    const { serverDB, userId, workspaceId } = context;
    const agentModel = new AgentModel(context.serverDB, context.userId, context.workspaceId);
    return {
      callAgent: async (
        params: CallAgentParams,
        ctx: ToolExecutionContext,
      ): Promise<ToolExecutionResult> => {
        const { agentId, instruction, taskTitle, timeout } = params;

        if (ctx.isSubAgent) {
          return {
            content: 'Agent calls cannot be triggered from within another sub-agent.',
            error: {
              code: 'NESTED_AGENT_CALL_NOT_ALLOWED',
              message: 'Agent calls cannot be triggered from within another sub-agent.',
            },
            success: false,
          };
        }

        if (!ctx.subAgent) {
          return {
            content: 'Agent execution is not available in this runtime.',
            error: { code: 'AGENT_CALL_UNAVAILABLE' },
            success: false,
          };
        }

        if (!instruction || typeof instruction !== 'string') {
          return {
            content: 'instruction is required.',
            error: { code: 'INVALID_ARGUMENTS', message: 'instruction is required.' },
            success: false,
          };
        }

        const description = taskTitle || `Call agent ${agentId}`;
        const { started, error, subOperationId, threadId } = await ctx.subAgent.run({
          agentId,
          description,
          instruction,
          timeout: timeout || 1_800_000,
        });

        if (!started) {
          const detail = error ? `: ${error}` : '.';
          const message = `Agent "${agentId}" failed to start${detail}`;
          return {
            content: message,
            error: { code: 'AGENT_CALL_START_FAILED', message },
            success: false,
          };
        }

        return {
          content: '',
          deferred: true,
          state: {
            status: 'pending',
            subOperationId,
            targetAgentId: agentId,
            threadId,
          },
          success: true,
        };
      },

      createAgent: async (
        params: CreateAgentParams,
        ctx: ToolExecutionContext,
      ): Promise<ToolExecutionResult> => {
        try {
          if (!ctx.agentId) throw new Error('Agent setup required: invoking agent is missing');
          const runtimeConfig = await agentModel.inheritRuntimeForCreation(ctx.agentId, {
            deviceId: ctx.activeDeviceId,
            model: params.model,
            provider: params.provider,
            visibility: 'private',
          });
          // Guard against LLM double-encoding: if array fields are JSON strings, parse them.
          const parseArrayParam = (v: any): string[] | undefined => {
            if (typeof v === 'string') {
              try {
                return JSON.parse(v);
              } catch {
                return undefined;
              }
            }
            return v;
          };

          const agent = await agentModel.create({
            avatar: params.avatar,
            backgroundColor: params.backgroundColor,
            description: params.description,
            openingMessage: params.openingMessage,
            openingQuestions: parseArrayParam(params.openingQuestions),
            plugins: parseArrayParam(params.plugins),
            systemRole: params.systemRole,
            tags: parseArrayParam(params.tags),
            title: params.title,
            visibility: 'private',
            ...runtimeConfig,
          });

          return {
            content: `Successfully created agent "${params.title}" with ID: ${agent.id}`,
            state: { agentId: agent.id, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to create agent');
        }
      },

      deleteAgent: async (params: DeleteAgentParams): Promise<ToolExecutionResult> => {
        try {
          await agentModel.delete(params.agentId);
          return {
            content: `Successfully deleted agent ${params.agentId}`,
            state: { agentId: params.agentId, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to delete agent');
        }
      },

      duplicateAgent: async (params: DuplicateAgentParams): Promise<ToolExecutionResult> => {
        try {
          const result = await agentModel.duplicate(params.agentId, params.newTitle);
          if (!result) {
            return { content: `Agent "${params.agentId}" not found.`, success: false };
          }
          return {
            content: `Successfully duplicated agent. New agent ID: ${result.agentId}${params.newTitle ? ` with title "${params.newTitle}"` : ''}`,
            state: { newAgentId: result.agentId, sourceAgentId: params.agentId, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to duplicate agent');
        }
      },

      getAgentDetail: async (params: GetAgentDetailParams): Promise<ToolExecutionResult> => {
        try {
          let agent = await agentModel.getAgentConfigById(params.agentId);
          if (!agent) {
            return { content: `Agent "${params.agentId}" not found.`, success: false };
          }

          if (workspaceId) {
            const access = await getResourceConfigAccess(
              { db: serverDB, userId, workspaceId },
              'agent',
              params.agentId,
            );
            if (access === 'none')
              return { content: `Agent "${params.agentId}" not found.`, success: false };
            if (access === 'profile') agent = redactAgentConfig(agent);
          }

          // Normalize to identifier strings (annotated with mode when not
          // pinned) — `agent.plugins` is the raw AgentPluginEntry[] (string |
          // {identifier, mode}), but both the LLM-facing summary and the
          // GetAgentDetailState.config.plugins contract expect string[].
          // Passing object-shaped entries through to the client would break
          // GetAgentDetailRender's <Tag key={plugin}>{plugin}</Tag>.
          const pluginSummaries = agent.plugins?.map((entry) => {
            const { identifier, mode } = parsePluginEntry(entry);
            return mode === 'pinned' ? identifier : `${identifier} (${mode})`;
          });

          const detail = {
            config: {
              model: agent.model,
              openingMessage: agent.openingMessage,
              openingQuestions: agent.openingQuestions,
              plugins: pluginSummaries,
              provider: agent.provider,
              systemRole: agent.systemRole,
            },
            meta: {
              avatar: agent.avatar,
              backgroundColor: agent.backgroundColor,
              description: agent.description,
              tags: agent.tags,
              title: agent.title,
            },
          };

          const parts: string[] = [];
          if (detail.meta.title) parts.push(`**${detail.meta.title}**`);
          if (detail.meta.description) parts.push(detail.meta.description);
          if (detail.config.model)
            parts.push(`Model: ${detail.config.provider || ''}/${detail.config.model}`);
          if (detail.config.plugins?.length) {
            parts.push(`Plugins: ${detail.config.plugins.join(', ')}`);
          }
          if (detail.config.systemRole) parts.push(`System Prompt: ${detail.config.systemRole}`);

          return {
            content: parts.length > 0 ? parts.join('\n') : `Agent "${params.agentId}" found.`,
            state: { agentId: params.agentId, ...detail, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to get agent detail');
        }
      },

      searchAgent: async (params: SearchAgentParams): Promise<ToolExecutionResult> => {
        try {
          const limit = Math.min(params.limit || 10, MAX_SEARCH_AGENT_LIMIT);
          const offset = Math.max(params.offset || 0, 0);
          const [sliced, totalCount] = await Promise.all([
            agentModel.queryAgents({ keyword: params.keyword, limit, offset }),
            agentModel.countAgents({ keyword: params.keyword }),
          ]);
          const hasMore = offset + sliced.length < totalCount;

          const content = searchAgentsResultsPrompt({
            agents: sliced.map((a) => ({
              description: a.description ?? undefined,
              heteroType: a.heteroType,
              id: a.id,
              title: a.title ?? undefined,
            })),
            hasMore,
            maxLimit: MAX_SEARCH_AGENT_LIMIT,
            offset,
            requestedLimit: params.limit,
            userTotal: totalCount,
          });

          return {
            content,
            state: {
              agents: sliced,
              hasMore,
              keyword: params.keyword,
              offset,
              totalCount,
            },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to search agents');
        }
      },

      updateAgent: async (params: UpdateAgentParams): Promise<ToolExecutionResult> => {
        try {
          const { agentId } = params;
          let { config, meta } = params;

          // Guard against LLM double-encoding: parse strings if needed
          if (typeof config === 'string') {
            try {
              config = JSON.parse(config as string);
            } catch {
              config = undefined;
            }
          }
          if (typeof meta === 'string') {
            try {
              meta = JSON.parse(meta as string);
            } catch {
              meta = undefined;
            }
          }

          const updatedParts: string[] = [];

          if (config && Object.keys(config).length > 0) {
            await agentModel.updateConfig(agentId, config as Record<string, unknown>);
            updatedParts.push(`config: ${Object.keys(config).join(', ')}`);
          }

          if (meta && Object.keys(meta).length > 0) {
            await agentModel.update(agentId, meta as Record<string, unknown>);
            updatedParts.push(`meta: ${Object.keys(meta).join(', ')}`);
          }

          if (updatedParts.length === 0) {
            return { content: 'No fields to update.', state: { success: true }, success: true };
          }

          return {
            content: `Successfully updated agent. Updated ${updatedParts.join('; ')}`,
            state: { agentId, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to update agent');
        }
      },

      updatePrompt: async (params: UpdatePromptParams): Promise<ToolExecutionResult> => {
        try {
          const { agentId, prompt } = params;
          await agentModel.update(agentId, { editorData: null, systemRole: prompt } as Record<
            string,
            unknown
          >);

          return {
            content: prompt
              ? `Successfully updated system prompt (${prompt.length} characters)`
              : 'Successfully cleared system prompt',
            state: { newPrompt: prompt, success: true },
            success: true,
          };
        } catch (error) {
          return handleError(error, 'Failed to update prompt');
        }
      },
    };
  },
  identifier: AgentManagementIdentifier,
};
