import { getSubAgentChatConfigOverride, resolveSubAgentModel } from '@orvilo/const';
import {
  type ChatToolPayload,
  type RuntimeStepContext,
  type SubAgentCallbacks,
} from '@orvilo/types';
import debug from 'debug';

import { resolveEffectiveWorkingDirectory } from '@/helpers/effectiveWorkingDirectory';
import { resolveClientLocalSandbox } from '@/helpers/localSandbox';
import { type MCPToolCallResult } from '@/libs/mcp';
import { mcpService } from '@/services/mcp';
import { messageService } from '@/services/message';
import { archiveToolResultViaServer } from '@/services/toolResultArchive';
import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { ClientSubAgentTransport } from '@/store/chat/agents/transports/ClientSubAgentTransport';
import { operationSelectors } from '@/store/chat/slices/operation';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';
import { type ChatStore } from '@/store/chat/store';
import { useToolStore } from '@/store/tool';
import { composioStoreSelectors, orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { hasExecutor } from '@/store/tool/slices/builtin/executors';
import { type StoreSetter } from '@/store/types';
import { safeParseJSON } from '@/utils/safeParseJSON';

import { dbMessageSelectors } from '../../message/selectors';
import { type RemoteToolExecutor } from './exector';
import { composioExecutor, orviloSkillExecutor } from './exector';

const log = debug('orvilo-store:plugin-types');

/**
 * Plugin type-specific implementations
 * Each method handles a specific type of plugin invocation
 */

type Setter = StoreSetter<ChatStore>;
export const pluginTypes = (set: Setter, get: () => ChatStore, _api?: unknown) =>
  new PluginTypesActionImpl(set, get, _api);

export class PluginTypesActionImpl {
  readonly #get: () => ChatStore;

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api;
    void set;
    this.#get = get;
  }

  invokeBuiltinTool = async (
    id: string,
    payload: ChatToolPayload,
    stepContext?: RuntimeStepContext,
  ): Promise<any> => {
    // When the tool call comes from a DB-stored message (e.g. after humanIntervention approval),
    // the `source` field is not persisted and arrives as undefined. Fall back to a live store
    // lookup so Composio / Orvilo Skill tools still route correctly.
    let effectiveSource = payload.source;
    if (!effectiveSource) {
      const toolStoreState = useToolStore.getState();
      const composioTools = composioStoreSelectors.composioAsOrviloTools(toolStoreState);
      if (composioTools.some((t) => t.identifier === payload.identifier)) {
        effectiveSource = 'composio';
      } else {
        const orviloSkillTools = orviloSkillStoreSelectors.orviloSkillAsOrviloTools(toolStoreState);
        if (orviloSkillTools.some((t) => t.identifier === payload.identifier)) {
          effectiveSource = 'orviloSkill';
        }
      }
    }

    if (effectiveSource === 'composio') {
      return await this.#get().invokeComposioTypePlugin(id, {
        ...payload,
        source: effectiveSource,
      });
    }

    if (effectiveSource === 'orviloSkill') {
      return await this.#get().invokeOrviloSkillTypePlugin(id, {
        ...payload,
        source: effectiveSource,
      });
    }

    const params = safeParseJSON(payload.arguments);
    if (!params) return { error: 'Invalid arguments', success: false };

    // Check if there's a registered executor in Tool Store (new architecture)
    if (await hasExecutor(payload.identifier, payload.apiName)) {
      const { optimisticUpdateToolMessage, registerAfterCompletionCallback } = this.#get();

      // Get operation context
      const operationId = this.#get().messageOperationMap[id];
      const operation = operationId ? this.#get().operations[operationId] : undefined;
      const context = operationId ? { operationId } : undefined;

      const rootRuntimeOperation = operationId
        ? operationSelectors.findRootRuntimeOperation(operationId)(this.#get())
        : undefined;
      const rootRuntimeOperationId = rootRuntimeOperation?.id;
      const rootRuntimeOperationContext = rootRuntimeOperation?.context ?? operation?.context;

      // Get agent ID, group ID, topic ID, and page scope from operation context.
      // Prefer the concrete tool operation; fall back to the runtime root for
      // legacy operations created before child context inheritance was complete.
      let agentId = operation?.context?.agentId ?? rootRuntimeOperationContext?.agentId;
      let groupId = operation?.context?.groupId ?? rootRuntimeOperationContext?.groupId;
      const documentId = operation?.context?.documentId ?? rootRuntimeOperationContext?.documentId;
      const scope = operation?.context?.scope ?? rootRuntimeOperationContext?.scope;
      const viewedTask = operation?.context?.viewedTask ?? rootRuntimeOperationContext?.viewedTask;
      const taskId = viewedTask?.type === 'detail' ? viewedTask.taskId : undefined;
      const topicId = operation?.context?.topicId ?? rootRuntimeOperationContext?.topicId;
      const threadId = operation?.context?.threadId ?? rootRuntimeOperationContext?.threadId;
      const toolMessage = dbMessageSelectors.getDbMessageById(id)(this.#get());
      const anchorMessageId = toolMessage?.parentId ?? rootRuntimeOperationContext?.messageId;
      const isSubAgent =
        operation?.context?.isSubAgent ?? rootRuntimeOperationContext?.isSubAgent ?? false;

      // For agent-builder tools, inject activeAgentId from store if not in context
      // This is needed because AgentBuilderProvider uses a separate scope for messages
      // but the tools need the correct agentId for execution
      if (payload.identifier === 'orvilo-agent-builder') {
        const activeAgentId = this.#get().activeAgentId;
        if (activeAgentId) {
          agentId = activeAgentId;
        }
      }

      // For group-agent-builder tools, inject activeGroupId from store if not in context
      // This is needed because AgentBuilderProvider uses a separate scope for messages
      // but still needs groupId for tool execution
      if (!groupId && payload.identifier === 'orvilo-group-agent-builder') {
        const { getChatGroupStoreState } = await import('@/store/agentGroup');
        groupId = getChatGroupStoreState().activeGroupId;
      }

      // Sub-agent runner injected for sub-agent-spawning tools
      // (orvilo-agent.callSubAgent). Dispatches a server-backed sub-agent task and
      // polls for completion via `ClientSubAgentTransport`, so the tool returns
      // a normal tool result. The local browser runtime is retired.
      //
      // The spawn-site contract the client runtime kept still applies here:
      // `inheritMessages` forwards to the server (which seeds the isolation
      // thread), and the child is an anonymous clone of the parent — the
      // parent's `agencyConfig.subagent` model/provider/chatConfig overrides
      // resolve here, not inside the transport.
      const subAgentParentOperationId = rootRuntimeOperationId ?? operationId;
      const subAgent: SubAgentCallbacks = {
        run: async (runParams) => {
          if (!agentId || !topicId) {
            return {
              error: 'No agent context available for sub-agent execution',
              result: 'No agent context available for sub-agent execution',
              success: false,
              threadId: '',
            };
          }

          const parentAgentConfig =
            agentSelectors.getAgentConfigById(agentId)(getAgentStoreState());
          const parentEffectiveModel =
            topicSelectors.getTopicModelById(topicId)(this.#get()) ?? parentAgentConfig;
          const subAgentModel = resolveSubAgentModel(
            parentAgentConfig?.agencyConfig?.subagent,
            parentEffectiveModel,
          );

          const result = await new ClientSubAgentTransport(
            this.#get,
            subAgentParentOperationId,
          ).execSubAgent({
            agentId,
            chatConfig: getSubAgentChatConfigOverride(parentAgentConfig?.agencyConfig?.subagent),
            inheritMessages: runParams.inheritMessages,
            instruction: runParams.instruction,
            isSubAgent: true,
            model: subAgentModel.model,
            parentMessageId: runParams.toolMessageId,
            parentOperationId: subAgentParentOperationId,
            provider: subAgentModel.provider,
            timeout: runParams.timeout,
            title: runParams.description,
            topicId,
          });
          return {
            error: result.error,
            model: subAgentModel.model,
            result: result.result ?? '',
            success: result.success,
            threadId: result.threadId,
            // Terminal task metrics ride back so the parent's usage tray and
            // the tool message's pluginState account for the isolated work.
            totalCost: result.cost?.total,
            totalInputTokens: result.usage?.prompt_tokens,
            totalOutputTokens: result.usage?.completion_tokens,
            totalTokens: result.usage?.total_tokens,
            totalToolCalls: result.totalToolCalls,
          };
        },
      };

      // Create registerAfterCompletion function that registers callback to root runtime operation
      const registerAfterCompletion = rootRuntimeOperationId
        ? (callback: Parameters<typeof registerAfterCompletionCallback>[1]) => {
            registerAfterCompletionCallback(rootRuntimeOperationId!, callback);
          }
        : undefined;

      log(
        '[invokeBuiltinTool] Using Tool Store executor: %s/%s, messageId=%s, agentId=%s, groupId=%s, rootRuntimeOp=%s, stepContext=%O',
        payload.identifier,
        payload.apiName,
        id,
        agentId,
        groupId,
        rootRuntimeOperationId,
        !!stepContext,
      );

      // Call Tool Store's invokeBuiltinTool
      log('[BuiltinToolCall] invoke:start', {
        agentId,
        apiName: payload.apiName,
        documentId,
        identifier: payload.identifier,
        messageId: id,
        operationId,
        rootRuntimeOperationId,
        isSubAgent,
        scope,
        taskId,
        threadId,
        topicId,
      });

      const result = await useToolStore
        .getState()
        .invokeBuiltinTool(payload.identifier, payload.apiName, params, {
          agentId,
          anchorMessageId,
          documentId,
          groupId,
          isSubAgent,
          // Only the in-process desktop path reaches here; gateway-routed runs
          // get the same decision from the server device-proxy. Both funnel
          // through `isLocalSandboxEnabled`, so they cannot disagree.
          ...resolveClientLocalSandbox(agentId, topicId),
          messageId: id,
          operationId,
          registerAfterCompletion,
          rootOperationId: rootRuntimeOperationId ?? operationId,
          scope,
          signal: operation?.abortController?.signal,
          sourceMessageId:
            operation?.context?.sourceMessageId ??
            rootRuntimeOperationContext?.sourceMessageId ??
            rootRuntimeOperationContext?.messageId,
          stepContext,
          subAgent,
          taskId,
          threadId,
          toolCallId: payload.id,
          toolMessageId: id,
          topicId,
          workingDirectory: resolveEffectiveWorkingDirectory(
            this.#get(),
            topicId ?? rootRuntimeOperationContext?.topicId,
            agentId ?? rootRuntimeOperationContext?.agentId,
          ),
        });

      log('[BuiltinToolCall] invoke:end', {
        apiName: payload.apiName,
        errorType: result.error?.type,
        identifier: payload.identifier,
        messageId: id,
        operationId,
        success: result.success,
      });

      // When error exists but content is empty, backfill error message into content
      const rawContent = result.content || result.error?.message || '';
      const content = await archiveToolResultViaServer({
        agentId,
        content: rawContent,
        identifier: payload.identifier,
        toolCallId: payload.id,
        topicId,
      });

      // Use optimisticUpdateToolMessage to batch update content, state, error, metadata
      await optimisticUpdateToolMessage(
        id,
        {
          content,
          metadata: result.metadata,
          pluginError: result.error
            ? {
                body: result.error.body,
                message: result.error.message,
                type: result.error.type as any,
              }
            : undefined,
          pluginState: result.state,
        },
        context,
      );

      // If result.stop is true, the tool wants to stop execution flow
      // This is handled by returning from the function (no further processing)
      if (result.stop) {
        log('[invokeBuiltinTool] Executor returned stop=true, stopping execution');
      }

      // Return the result for call_tool executor to use
      return result;
    }

    // All builtin tools should be handled by the executor registry above
    // If we reach here, it means the tool is not registered
    console.error(
      `[invokeBuiltinTool] No executor found for: ${payload.identifier}/${payload.apiName}`,
    );
    return {
      content: `Tool ${payload.identifier}/${payload.apiName} is not available`,
      error: { type: 'ToolNotFound', message: 'No executor found' },
      success: false,
    };
  };

  invokeComposioTypePlugin = async (
    id: string,
    payload: ChatToolPayload,
  ): Promise<string | undefined> => {
    return this.#get().internal_invokeRemoteToolPlugin(
      id,
      payload,
      composioExecutor,
      'invokeComposioTypePlugin',
    );
  };

  invokeOrviloSkillTypePlugin = async (
    id: string,
    payload: ChatToolPayload,
  ): Promise<string | undefined> => {
    return this.#get().internal_invokeRemoteToolPlugin(
      id,
      payload,
      orviloSkillExecutor,
      'invokeOrviloSkillTypePlugin',
    );
  };

  invokeMCPTypePlugin = async (
    id: string,
    payload: ChatToolPayload,
  ): Promise<string | undefined> => {
    let data: MCPToolCallResult | undefined;

    // Get message to extract agentId/topicId
    const message = dbMessageSelectors.getDbMessageById(id)(this.#get());

    // Get abort controller from operation
    const operationId = this.#get().messageOperationMap[id];
    const operation = operationId ? this.#get().operations[operationId] : undefined;
    const abortController = operation?.abortController;

    log(
      '[invokeMCPTypePlugin] messageId=%s, tool=%s, operationId=%s, aborted=%s',
      id,
      payload.apiName,
      operationId,
      abortController?.signal.aborted,
    );

    try {
      const result = await mcpService.invokeMcpToolCall(payload, {
        signal: abortController?.signal,
        topicId: message?.topicId,
      });

      if (!!result) data = result;
    } catch (error) {
      console.error(error);
      const err = error as Error;

      // ignore the aborted request error
      if (err.message.includes('The user aborted a request.')) {
        log('[invokeMCPTypePlugin] Request aborted: messageId=%s, tool=%s', id, payload.apiName);
      } else {
        const result = await messageService.updateMessageError(id, error as any, {
          agentId: message?.agentId,
          topicId: message?.topicId,
        });
        if (result?.success && result.messages) {
          this.#get().replaceMessages(result.messages, {
            context: { agentId: message?.agentId || '', topicId: message?.topicId },
          });
        }
      }
    }

    // If error occurred, exit

    if (!data) return;

    // Archive oversized content (or truncate if archive context unavailable)
    const rawContent = data.content || (data.error as any)?.message || '';
    const truncatedContent = await archiveToolResultViaServer({
      agentId: message?.agentId,
      content: rawContent,
      identifier: payload.identifier,
      toolCallId: payload.id,
      topicId: message?.topicId,
    });

    // operationId already declared above, reuse it
    const context = operationId ? { operationId } : undefined;

    // Use optimisticUpdateToolMessage to update content and state/error in a single call
    await this.#get().optimisticUpdateToolMessage(
      id,
      {
        content: truncatedContent,
        pluginError: data.success ? undefined : data.error,
        pluginState: data.success ? data.state : undefined,
      },
      context,
    );

    return truncatedContent;
  };

  internal_invokeRemoteToolPlugin = async (
    id: string,
    payload: ChatToolPayload,
    executor: RemoteToolExecutor,
    logPrefix: string,
  ): Promise<string | undefined> => {
    let data: MCPToolCallResult | undefined;

    // Get message to extract sessionId/topicId
    const message = dbMessageSelectors.getDbMessageById(id)(this.#get());

    // Get abort controller from operation
    const operationId = this.#get().messageOperationMap[id];
    const operation = operationId ? this.#get().operations[operationId] : undefined;
    const abortController = operation?.abortController;

    log(
      '[%s] messageId=%s, tool=%s, operationId=%s, aborted=%s',
      logPrefix,
      id,
      payload.apiName,
      operationId,
      abortController?.signal.aborted,
    );

    try {
      // Pass topicId from message context, not global active state
      // This ensures tool calls use the correct topic even if user switches topics
      data = await executor(payload, {
        sourceToolCallId: payload.id,
        topicId: message?.topicId,
      });
    } catch (error) {
      console.error(`[${logPrefix}] Error:`, error);

      // ignore the aborted request error
      const err = error as Error;
      if (err.message.includes('aborted')) {
        log('[%s] Request aborted: messageId=%s, tool=%s', logPrefix, id, payload.apiName);
      } else {
        const result = await messageService.updateMessageError(id, error as any, {
          agentId: message?.agentId,
          topicId: message?.topicId,
        });
        if (result?.success && result.messages) {
          this.#get().replaceMessages(result.messages, {
            context: {
              agentId: message?.agentId,
              topicId: message?.topicId,
            },
          });
        }
      }
    }

    // If error occurred, exit
    if (!data) return;

    const rawContent = data.content || (data.error as any)?.message || '';
    const remoteContent = await archiveToolResultViaServer({
      agentId: message?.agentId,
      content: rawContent,
      identifier: payload.identifier,
      toolCallId: payload.id,
      topicId: message?.topicId,
    });
    const context = operationId ? { operationId } : undefined;

    // Use optimisticUpdateToolMessage to update content and state/error in a single call
    await this.#get().optimisticUpdateToolMessage(
      id,
      {
        content: remoteContent,
        pluginError: data.success ? undefined : data.error,
        pluginState: data.success ? data.state : undefined,
      },
      context,
    );

    return remoteContent;
  };
}

export type PluginTypesAction = Pick<PluginTypesActionImpl, keyof PluginTypesActionImpl>;
