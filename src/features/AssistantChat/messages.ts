import type { ThreadMessageLike } from '@assistant-ui/react';
import { LOADING_FLAT } from '@orvilo/const';
import type {
  AssistantContentBlock,
  ChatToolPayloadWithResult,
  UIChatMessage,
} from '@orvilo/types';

import { cleanSpeakerTag } from '@/store/chat/utils/cleanSpeakerTag';

type Part = Exclude<ThreadMessageLike['content'], string>[number];

export interface ToolSource {
  blockId: string;
  tool: ChatToolPayloadWithResult;
}

export interface MessageSource {
  message: UIChatMessage;
  tools: Record<string, ToolSource>;
}

/** Convert the display tree, rather than the DB rows, so grouped turns keep their order. */
export function toAssistantMessage(message: UIChatMessage): ThreadMessageLike {
  const content: Part[] = [];
  const tools: MessageSource['tools'] = {};
  const text = (value?: string | null) => {
    if (value && value !== LOADING_FLAT) content.push({ text: value, type: 'text' });
  };
  const appendTool = (blockId: string, tool: ChatToolPayloadWithResult) => {
    // Some runtimes reuse tool ids across turns; the block id is the stable namespace.
    const toolCallId = `${blockId}:${tool.id}`;
    tools[toolCallId] = { blockId, tool };
    content.push({
      argsText: tool.arguments || '{}',
      isError: !!tool.result?.error,
      result: tool.result?.content === LOADING_FLAT ? undefined : tool.result?.content,
      toolCallId,
      toolName: tool.apiName,
      type: 'tool-call',
    });
  };
  const media = (
    block: Pick<UIChatMessage, 'fileList' | 'imageList' | 'audioList' | 'videoList'>,
  ) => {
    if (
      block.fileList?.length ||
      block.imageList?.length ||
      block.audioList?.length ||
      block.videoList?.length
    ) {
      content.push({ data: block, name: 'orvilo-media', type: 'data' });
    }
  };
  const block = (item: AssistantContentBlock) => {
    if (item.reasoning?.content) content.push({ text: item.reasoning.content, type: 'reasoning' });
    text(item.content);
    media(item);
    item.tools?.forEach((tool) => appendTool(item.id, tool));
    item.tasks?.forEach((task) => content.push({ data: task, name: 'orvilo-task', type: 'data' }));
    item.council?.forEach(nested);
    if (item.error) content.push({ data: item.error, name: 'orvilo-error', type: 'data' });
  };
  const nested = (item: UIChatMessage) => {
    const converted = toAssistantMessage(item);
    if (typeof converted.content !== 'string') content.push(...converted.content);
    Object.assign(tools, (converted.metadata?.custom?.orvilo as MessageSource).tools);
  };

  const selections = message.metadata?.contextSelections?.length
    ? message.metadata.contextSelections
    : message.metadata?.pageSelections;
  if (selections?.length)
    content.push({ type: 'data', name: 'orvilo-selections', data: selections });
  if (message.reasoning?.content)
    content.push({ text: message.reasoning.content, type: 'reasoning' });
  // Group content can be a copy of the final child: render the ordered blocks only once.
  if (message.children?.length) message.children.forEach(block);
  else if (!message.plugin)
    text(message.role === 'user' ? cleanSpeakerTag(message.content) : message.content);
  message.tools?.forEach((tool) => appendTool(message.id, tool));
  message.taskCompletions?.forEach(block);
  message.members?.forEach(nested);
  message.tasks?.forEach(nested);
  message.columns?.forEach((column) => column.forEach(nested));
  if (message.compressedMessages?.length) {
    content.push({ data: message.compressedMessages, name: 'orvilo-compressed', type: 'data' });
  }
  message.signalCallbacks?.forEach((group) =>
    group.callbacks.forEach((callback) => text(callback.content)),
  );
  if (message.taskDetail)
    content.push({ data: message.taskDetail, name: 'orvilo-task', type: 'data' });
  if (message.plugin) {
    appendTool(message.id, {
      ...message.plugin,
      id: message.tool_call_id || message.id,
      intervention: message.pluginIntervention,
      result: {
        content: message.content,
        error: message.pluginError,
        id: message.id,
        state: message.pluginState,
      },
      result_msg_id: message.id,
    });
  }
  media(message);
  if (message.error) content.push({ data: message.error, name: 'orvilo-error', type: 'data' });
  return {
    content,
    createdAt: new Date(message.createdAt),
    id: message.id,
    metadata: { custom: { orvilo: { message, tools } satisfies MessageSource } },
    role: message.role === 'user' ? 'user' : message.role === 'system' ? 'system' : 'assistant',
    ...(message.error ? { status: { reason: 'error', type: 'incomplete' } as const } : {}),
  };
}
