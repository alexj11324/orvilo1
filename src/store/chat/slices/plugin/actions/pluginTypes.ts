import {
  type ChatToolPayload,
  type RuntimeStepContext,
  type SubAgentCallbacks,
} from '@orvilo/types';
import debug from 'debug';

import { resolveEffectiveWorkingDirectory } from '@/helpers/effectiveWorkingDirectory';
import { resolveClientLocalSandbox } from '@/helpers/localSandbox';
import { archiveToolResultViaServer } from '@/services/toolResultArchive';
import { operationSelectors } from '@/store/chat/slices/operation';
import { type ChatStore } from '@/store/chat/store';
import { useToolStore } from '@/store/tool';
import { hasExecutor } from '@/store/tool/slices/builtin/executors';
import { type StoreSetter } from '@/store/types';
import { safeParseJSON } from '@/utils/safeParseJSON';

import { dbMessageSelectors } from '../../message/selectors';

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
    if (payload.source === 'composio' || payload.source === 'orviloSkill') {
      return {
        content: 'Configure third-party tools in the Agent native harness.',
        success: false,
      };
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

      // Get group orchestration callbacks if available (for group management tools)
      const groupOrchestration = this.#get().getGroupOrchestrationCallbacks?.();

      // Sub-agent runner injected for sub-agent-spawning tools (orvilo-agent.callSubAgent).
      // Runs the sub-agent in an isolated thread using the current client runtime
      // and resolves with its output, so the tool returns a normal tool result.
      const subAgentParentOperationId = rootRuntimeOperationId ?? operationId;
      const subAgent: SubAgentCallbacks = {
        run: (runParams) => {
          if (!agentId || !topicId) {
            return Promise.resolve({
              error: 'No agent context available for sub-agent execution',
              result: 'No agent context available for sub-agent execution',
              success: false,
              threadId: '',
            });
          }
          return this.#get().runClientSubAgent({
            ...runParams,
            agentId,
            parentOperationId: subAgentParentOperationId,
            topicId,
          });
        },
      };

      // Create registerAfterCompletion function that registers callback to root runtime operation
      const registerAfterCompletion = rootRuntimeOperationId
        ? (callback: Parameters<typeof registerAfterCompletionCallback>[1]) => {
            registerAfterCompletionCallback(rootRuntimeOperationId!, callback);
          }
        : undefined;

      log(
        '[invokeBuiltinTool] Using Tool Store executor: %s/%s, messageId=%s, agentId=%s, groupId=%s, hasGroupOrchestration=%s, rootRuntimeOp=%s, stepContext=%O',
        payload.identifier,
        payload.apiName,
        id,
        agentId,
        groupId,
        !!groupOrchestration,
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
          groupOrchestration,
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
}

export type PluginTypesAction = Pick<PluginTypesActionImpl, keyof PluginTypesActionImpl>;
