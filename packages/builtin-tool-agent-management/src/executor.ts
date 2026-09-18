/**
 * Agent Management Executor
 *
 * Handles all agent management tool calls for creating, updating,
 * deleting, searching, and calling AI agents.
 * Delegates to AgentManagerRuntime for actual implementation.
 */
import { AgentManagerRuntime } from '@orvilo/agent-manager-runtime';
import {
  BaseExecutor,
  type BuiltinToolContext,
  type BuiltinToolResult,
  type ConversationContext,
} from '@orvilo/types';

import { agentService } from '@/services/agent';
import { discoverService } from '@/services/discover';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { AGENT_BINDING_REQUIRED_ERROR } from '@/store/chat/slices/agentRun/actions/dispatch/agentDispatcher';

import {
  AgentManagementApiName,
  AgentManagementIdentifier,
  type CallAgentParams,
  type CallAgentState,
  type CreateAgentParams,
  type DeleteAgentParams,
  type DuplicateAgentParams,
  type GetAgentDetailParams,
  type InstallPluginParams,
  type SearchAgentParams,
  type UpdateAgentParams,
  type UpdatePromptParams,
} from './types';

const runtime = new AgentManagerRuntime({
  agentService,
  discoverService,
});

class AgentManagementExecutor extends BaseExecutor<typeof AgentManagementApiName> {
  readonly identifier = AgentManagementIdentifier;
  protected readonly apiEnum = AgentManagementApiName;

  // ==================== Agent CRUD ====================

  createAgent = async (params: CreateAgentParams): Promise<BuiltinToolResult> => {
    return runtime.createAgent(params);
  };

  updateAgent = async (params: UpdateAgentParams): Promise<BuiltinToolResult> => {
    const { agentId } = params;
    // LLMs sometimes double-encode JSON, sending config/meta as stringified JSON
    // instead of objects. Parse them defensively before passing to runtime.
    let { config, meta } = params;
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch {
        /* ignore */
      }
    }
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        /* ignore */
      }
    }
    return runtime.updateAgentConfig(agentId, { config, meta });
  };

  deleteAgent = async (params: DeleteAgentParams): Promise<BuiltinToolResult> => {
    return runtime.deleteAgent(params.agentId);
  };

  getAgentDetail = async (params: GetAgentDetailParams): Promise<BuiltinToolResult> => {
    return runtime.getAgentDetail(params.agentId);
  };

  duplicateAgent = async (params: DuplicateAgentParams): Promise<BuiltinToolResult> => {
    return runtime.duplicateAgent(params.agentId, params.newTitle);
  };

  updatePrompt = async (params: UpdatePromptParams): Promise<BuiltinToolResult> => {
    return runtime.updatePrompt(params.agentId, { prompt: params.prompt });
  };

  installPlugin = async (params: InstallPluginParams): Promise<BuiltinToolResult> => {
    return runtime.installPlugin(params.agentId, {
      identifier: params.identifier,
      source: params.source,
    });
  };

  // ==================== Search ====================

  searchAgent = async (params: SearchAgentParams): Promise<BuiltinToolResult> => {
    return runtime.searchAgents(params);
  };

  // ==================== Execution ====================

  callAgent = async (
    params: CallAgentParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const {
      agentId,
      instruction,
      runAsTask,
      taskTitle,
      timeout,
      skipCallSupervisor = false,
    } = params;

    if (runAsTask) {
      // Dispatch as a legacy async agent invocation.
      // Pre-load target agent config to ensure it exists
      const targetAgentExists = useAgentStore.getState().agentMap[agentId];
      if (!targetAgentExists) {
        try {
          const config = await agentService.getAgentConfigById(agentId);
          if (!config) {
            return {
              content: `Agent "${agentId}" not found in your workspace. Please check the agent ID and try again.`,
              success: false,
            };
          }
          useAgentStore.getState().internal_dispatchAgentMap(agentId, config);
        } catch (error) {
          console.error('[callAgent] Failed to load agent config:', error);
          return {
            content: `Failed to load agent "${agentId}": ${(error as Error).message}`,
            success: false,
          };
        }
      }

      // Return special state recognized by AgentRuntime's exec_sub_agent executor.
      // callAgent keeps this alias until it is redesigned as an explicit agent invocation.
      return {
        content: `🚀 Triggered async task to call agent "${agentId}"${taskTitle ? `: ${taskTitle}` : ''}`,
        state: {
          parentMessageId: ctx.messageId,
          task: {
            description: taskTitle || `Call agent ${agentId}`,
            instruction,
            targetAgentId: agentId, // Special field for callAgent - indicates target agent
            timeout: timeout || 1_800_000,
          },
          type: 'execSubAgent',
        },
        stop: true,
        success: true,
      };
    }

    // Execute as synchronous speak
    // Two modes: Group vs Agents

    // Mode 1: Group environment - use group orchestration.
    // A group context without `groupOrchestration` must NOT fall through to the
    // non-group path: nothing would schedule the member run, so reporting
    // success would be a lie. Fail loudly instead.
    if (ctx.groupId && !(ctx.groupOrchestration && ctx.registerAfterCompletion)) {
      return {
        content:
          'Group orchestration is not available in this runtime — the supervisor turn must execute through a runtime that provides member scheduling.',
        success: false,
      };
    }

    if (ctx.groupId && ctx.groupOrchestration && ctx.agentId && ctx.registerAfterCompletion) {
      // Register afterCompletion callback to trigger group orchestration
      ctx.registerAfterCompletion(() =>
        ctx.groupOrchestration!.triggerSpeak({
          agentId,
          instruction,
          skipCallSupervisor,
          supervisorAgentId: ctx.agentId!,
        }),
      );

      return {
        content: `Triggered agent "${agentId}" to respond.`,
        state: {
          agentId,
          instruction,
          mode: 'speak',
          skipCallSupervisor,
        } as CallAgentState,
        stop: true,
        success: true,
      };
    }

    // Mode 2: Agents mode (non-group) - execute directly with subAgentId
    if (ctx.registerAfterCompletion) {
      // Pre-load target agent config if not already loaded (before registerAfterCompletion)
      // This ensures we fail fast with a clear error message if agent doesn't exist
      const targetAgentExists = useAgentStore.getState().agentMap[agentId];
      if (!targetAgentExists) {
        try {
          const config = await agentService.getAgentConfigById(agentId);
          if (!config) {
            return {
              content: `Agent "${agentId}" not found in your workspace. Please check the agent ID and try again.`,
              success: false,
            };
          }
          useAgentStore.getState().internal_dispatchAgentMap(agentId, config);
        } catch (error) {
          console.error('[callAgent] Failed to load agent config:', error);
          return {
            content: `Failed to load agent "${agentId}": ${(error as Error).message}`,
            success: false,
          };
        }
      }

      // Surface an unsupported binding SYNCHRONOUSLY: the in-browser client
      // runtime is retired and the deferred afterCompletion callback's throw
      // would only be logged by buildRunLifecycle — the model would still get
      // `success: true` and the user would see no actionable failure.
      if (!useChatStore.getState().isGatewayModeEnabled(agentId)) {
        return {
          content: `Cannot call agent "${agentId}": no execution binding is available. Enable gateway mode or bind a runtime for this agent, then retry.`,
          success: false,
        };
      }

      // Register afterCompletion to execute the agent via the gateway runtime.
      // The in-browser client runtime is retired: without gateway mode there is
      // no execution path, so surface an explicit binding-required error instead
      // of silently falling back.
      ctx.registerAfterCompletion(async () => {
        const get = useChatStore.getState;

        if (!get().isGatewayModeEnabled(agentId)) {
          throw new Error(AGENT_BINDING_REQUIRED_ERROR);
        }

        const conversationContext: ConversationContext = {
          agentId: ctx.agentId || '',
          topicId: ctx.topicId || null,
        };

        try {
          // Execute with the target agent, but route persisted/streamed messages
          // to the parent conversation. This keeps speaker identity and
          // conversation ownership separate instead of hiding cross-agent
          // replies in another messageMap bucket.
          await get().executeGatewayAgent({
            context: {
              ...conversationContext,
              agentId,
              scope: 'sub_agent',
              subAgentId: agentId,
            },
            message: instruction,
            messageContext: conversationContext,
          });
        } catch (error) {
          console.error('[callAgent] executeGatewayAgent failed:', error);
          throw error;
        }
      });

      return {
        content: `Called agent "${agentId}" to respond.`,
        state: {
          agentId,
          instruction,
          mode: 'speak',
          skipCallSupervisor,
        } as CallAgentState,
        stop: true,
        success: true,
      };
    }

    // Fallback if registerAfterCompletion not available
    console.warn('[callAgent] registerAfterCompletion not available in context');
    return {
      content: `Called agent "${agentId}" but execution may not complete properly.`,
      state: {
        agentId,
        instruction,
        mode: 'speak',
        skipCallSupervisor,
      } as CallAgentState,
      stop: true,
      success: false,
    };
  };
}

export const agentManagementExecutor = new AgentManagementExecutor();
