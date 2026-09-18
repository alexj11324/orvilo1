import { INBOX_SESSION_ID, ORVILO_OBSERVATION_ID, ORVILO_TRACE_ID } from '@orvilo/const';
import { type ChatStreamCallbacks, type ChatStreamPayload } from '@orvilo/model-runtime';
import { type TracePayload } from '@orvilo/types';
import { TraceTagMap } from '@orvilo/types';

import { TraceClient } from '@/libs/traces';
import { after } from '@/server/utils/scheduleAfterResponse';

export interface AgentChatOptions {
  enableTrace?: boolean;
  provider: string;
  trace?: TracePayload;
}

export const createTraceOptions = (
  payload: ChatStreamPayload,
  { trace: tracePayload, provider }: AgentChatOptions,
) => {
  const { messages, model, tools, ...parameters } = payload;
  // create a trace to monitor the completion
  const traceClient = new TraceClient();
  const messageLength = messages.length;
  const systemRole = messages.find((message) => message.role === 'system')?.content;

  const trace = traceClient.createTrace({
    id: tracePayload?.traceId,
    input: messages,
    metadata: { messageLength, model, provider, systemRole, tools },
    name: tracePayload?.traceName,
    sessionId: tracePayload?.topicId
      ? tracePayload.topicId
      : `${tracePayload?.sessionId || INBOX_SESSION_ID}@default`,
    tags: tracePayload?.tags,
    userId: tracePayload?.userId,
  });

  const generation = trace?.generation({
    input: messages,
    metadata: { messageLength, model, provider },
    model,
    modelParameters: parameters as any,
    name: `Chat Completion (${provider})`,
    startTime: new Date(),
  });

  const headers = new Headers();

  if (trace?.id) {
    headers.set(ORVILO_TRACE_ID, trace.id);
  }

  if (generation?.id) {
    headers.set(ORVILO_OBSERVATION_ID, generation.id);
  }

  return {
    callback: {
      onCompletion: async ({ text, thinking, usage, grounding, toolsCalling }) => {
        const output =
          // if the toolsCalling is not empty, we need to return the toolsCalling
          !!toolsCalling && toolsCalling.length > 0
            ? !!text
              ? // tools calling with thinking and text
                { text, thinking, toolsCalling }
              : toolsCalling
            : !!thinking
              ? { text, thinking }
              : text;

        generation?.update({
          endTime: new Date(),
          metadata: { grounding, thinking },
          output,
          usage: usage
            ? {
                completionTokens: usage.outputTextTokens,
                input: usage.totalInputTokens,
                output: usage.totalOutputTokens,
                promptTokens: usage.inputTextTokens,
                totalTokens: usage.totalTokens,
              }
            : undefined,
        });

        trace?.update({ output });
      },

      onFinal: () => {
        after(async () => {
          try {
            await traceClient.shutdownAsync();
          } catch (e) {
            console.error('TraceClient shutdown error:', e);
          }
        });
      },

      onStart: () => {
        generation?.update({ completionStartTime: new Date() });
      },

      onToolsCalling: async () => {
        trace?.update({
          tags: [...(tracePayload?.tags || []), TraceTagMap.ToolsCalling],
        });
      },
    } as ChatStreamCallbacks,
    headers,
  };
};
