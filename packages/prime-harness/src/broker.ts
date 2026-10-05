/**
 * The `orvilo-broker` provider — the only way inference leaves the runner.
 *
 * Every upstream model call routes through `streamSimple`, which converts the
 * upstream Context into a SANITIZED InferenceRequest (no endpoints, headers,
 * or credentials — the runner never holds any) and issues `broker.infer` over
 * the host link. `broker.event` notifications stream the answer back into an
 * AssistantMessageEventStream.
 *
 * Protocol v2: the wire carries the full pi-ai message shape — content blocks
 * (text/thinking/image/toolCall), `toolResult` messages, the `tools` schemas
 * the model may call, and `thinkingLevel`/`serviceTier`/`providerOptions`
 * passthroughs — plus streamed `toolcall_*`/`thinking_delta` events. Tools
 * execute inside the runner on the device; the broker only relays inference.
 */

import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  ImageContent,
  Model,
  SimpleStreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type {
  BrokerStreamEvent,
  SanitizedContentBlock,
  SanitizedInferenceMessage,
  SanitizedToolCall,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isBrokerStreamEvent } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isRecord } from '@orvilo/utils/object';

import type { RunnerLink } from './ndjson';

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type SanitizedBlock = SanitizedContentBlock;

const toBlock = (
  content: TextContent | ThinkingContent | ImageContent | ToolCall,
): SanitizedBlock | undefined => {
  switch (content.type) {
    case 'text': {
      return { text: content.text, type: 'text' };
    }
    case 'thinking': {
      return { thinking: content.thinking, type: 'thinking' };
    }
    case 'image': {
      return { data: content.data, mimeType: content.mimeType, type: 'image' };
    }
    case 'toolCall': {
      return {
        arguments: content.arguments,
        id: content.id,
        name: content.name,
        type: 'toolCall',
      };
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Context → sanitized wire messages. Every upstream message shape has a wire
 * form; an unknown/empty block set makes the request invalid rather than
 * silently dropped.
 */
const sanitizeMessages = (context: Context): SanitizedInferenceMessage[] | undefined => {
  const out: SanitizedInferenceMessage[] = [];
  if (typeof context.systemPrompt === 'string' && context.systemPrompt.length > 0) {
    out.push({ role: 'system', content: context.systemPrompt });
  }
  for (const message of context.messages) {
    if (message.role === 'user') {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content.map(toBlock).filter((b): b is SanitizedBlock => b !== undefined);
      out.push({ content, role: 'user' });
      continue;
    }
    if (message.role === 'assistant') {
      const blocks = message.content
        .map(toBlock)
        .filter((b): b is SanitizedBlock => b !== undefined);
      out.push({ content: blocks, role: 'assistant' });
      continue;
    }
    if (message.role === 'toolResult') {
      const blocks = message.content
        .map(toBlock)
        .filter((b): b is SanitizedBlock => b !== undefined);
      out.push({
        content: blocks,
        isError: message.isError,
        role: 'tool',
        toolCallId: message.toolCallId,
        toolName: message.toolName,
      });
      continue;
    }
    return undefined;
  }
  return out.length > 0 ? out : undefined;
};

const sanitizeTools = (context: Context) =>
  Array.isArray(context.tools)
    ? context.tools.map((tool) => ({
        description: tool.description,
        name: tool.name,
        parameters: tool.parameters,
      }))
    : undefined;

/** Per-request channel between `broker.event` notifications and `pump()`. */
interface OpenStream {
  abort: () => void;
  deliver: (event: BrokerStreamEvent) => void;
}

export interface BrokerBridge {
  /** Abort every open inference (session teardown). */
  abortAll: () => void;
  /** Route a `broker.event` notification to the open stream it names. */
  deliverEvent: (params: unknown) => void;
  /** pi-ai streamSimple signature for registerProvider('orvilo-broker'). */
  streamSimple: (
    model: Model,
    context: Context,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream;
}

/** In-flight tool call blocks keyed by their wire `index` (or call id). */
interface PartialToolCall {
  arguments: string;
  blockIndex: number;
  id?: string;
  name?: string;
}

export const createBrokerBridge = (link: RunnerLink, sessionId: () => string): BrokerBridge => {
  const open = new Map<string, OpenStream>();
  let sequence = 0;

  const makePartial = (model: Model): AssistantMessage => ({
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });

  const streamSimple = (
    model: Model,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream => {
    const stream = createAssistantMessageEventStream();
    const requestId = `infer-${++sequence}`;

    const fail = (message: string, aborted: boolean): void => {
      const partial = makePartial(model);
      partial.stopReason = aborted ? 'aborted' : 'error';
      partial.errorMessage = message;
      stream.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: partial });
      stream.end(partial);
    };

    const messages = sanitizeMessages(context);
    if (messages === undefined) {
      fail('Request context contains a message shape the wire cannot carry', false);
      return stream;
    }

    const usage: Usage = { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } };
    let aborted = options?.signal?.aborted ?? false;
    let brokerError: string | undefined;
    let resolveDone: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const onAbort = () => {
      aborted = true;
      void link.request('broker.cancel', { requestId }).catch(() => undefined);
      resolveDone?.();
    };
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    // Ordered assistant content blocks as they are finalized. Upstream
    // content is sequential — at most one text/thinking block is open at a
    // time; a new block kind closes the open one. Tool calls get their own
    // indices so parallel calls interleave correctly by `index`/id.
    const text: string[] = [];
    const thinking: string[] = [];
    const toolCalls: SanitizedToolCall[] = [];
    const openCalls = new Map<string, PartialToolCall>();
    let nextIndex = 0;
    let openBlock: { index: number; kind: 'text' | 'thinking' } | undefined;
    let sawToolCalls = false;

    // `index` is the provider's stream position — consistent across a call's
    // start/delta/end; toolCallId is the fallback for providers that emit no
    // index at all.
    const callKey = (event: { index?: number; toolCallId?: string }): string =>
      event.index !== undefined ? `i${event.index}` : (event.toolCallId ?? 'i0');

    const closeOpenBlock = (): void => {
      if (!openBlock) return;
      const partial = makePartial(model);
      if (openBlock.kind === 'text') {
        partial.content = [{ text: text.join(''), type: 'text' }];
        stream.push({
          type: 'text_end',
          contentIndex: openBlock.index,
          content: text.join(''),
          partial,
        });
      } else {
        partial.content = [{ thinking: thinking.join(''), type: 'thinking' }];
        stream.push({
          contentIndex: openBlock.index,
          content: thinking.join(''),
          partial,
          type: 'thinking_end',
        });
      }
      openBlock = undefined;
    };

    const openTextBlock = (): void => {
      if (openBlock?.kind === 'text') return;
      closeOpenBlock();
      const index = nextIndex;
      nextIndex += 1;
      openBlock = { index, kind: 'text' };
      stream.push({ type: 'text_start', contentIndex: index, partial: makePartial(model) });
    };

    const openThinkingBlock = (): void => {
      if (openBlock?.kind === 'thinking') return;
      closeOpenBlock();
      const index = nextIndex;
      nextIndex += 1;
      openBlock = { index, kind: 'thinking' };
      stream.push({ type: 'thinking_start', contentIndex: index, partial: makePartial(model) });
    };

    const dispatch = (event: BrokerStreamEvent): void => {
      switch (event.type) {
        case 'text': {
          openTextBlock();
          text.push(event.text);
          const partial = makePartial(model);
          partial.content = [{ text: text.join(''), type: 'text' }];
          stream.push({
            type: 'text_delta',
            contentIndex: openBlock?.index ?? 0,
            delta: event.text,
            partial,
          });
          return;
        }
        case 'thinking_delta': {
          openThinkingBlock();
          thinking.push(event.text);
          const partial = makePartial(model);
          partial.content = [{ thinking: thinking.join(''), type: 'thinking' }];
          stream.push({
            contentIndex: openBlock?.index ?? 0,
            delta: event.text,
            partial,
            type: 'thinking_delta',
          });
          return;
        }
        case 'toolcall_start': {
          sawToolCalls = true;
          closeOpenBlock();
          const index = nextIndex;
          nextIndex += 1;
          openCalls.set(callKey(event), {
            arguments: '',
            blockIndex: index,
            id: event.toolCallId,
            name: event.name,
          });
          stream.push({ type: 'toolcall_start', contentIndex: index, partial: makePartial(model) });
          return;
        }
        case 'toolcall_delta': {
          const call = openCalls.get(callKey(event));
          if (!call) return;
          call.arguments += event.argumentsDelta;
          stream.push({
            contentIndex: call.blockIndex,
            delta: event.argumentsDelta,
            partial: makePartial(model),
            type: 'toolcall_delta',
          });
          return;
        }
        case 'toolcall_end': {
          const call = openCalls.get(callKey(event)) ?? {
            arguments: '',
            blockIndex: nextIndex - 1,
          };
          openCalls.delete(callKey(event));
          const toolCall: ToolCall = {
            arguments: event.toolCall.arguments,
            id: event.toolCall.id,
            name: event.toolCall.name,
            type: 'toolCall',
          };
          toolCalls.push(event.toolCall);
          const partial = makePartial(model);
          partial.content = [toolCall];
          stream.push({
            contentIndex: call.blockIndex >= 0 ? call.blockIndex : nextIndex - 1,
            partial,
            toolCall,
            type: 'toolcall_end',
          });
          return;
        }
        case 'usage': {
          usage.input = event.inputTokens;
          usage.output = event.outputTokens;
          usage.totalTokens = event.inputTokens + event.outputTokens;
          return;
        }
        case 'error': {
          brokerError = event.message;
          resolveDone?.();
          return;
        }
        case 'end': {
          resolveDone?.();
          return;
        }
      }
    };

    // Events can outrun `broker.infer`'s ack; deltas pushed before their
    // block's `*_start` are dropped upstream, so queue until the pump opens
    // the stream, then flush in order.
    let streamOpen = false;
    const pending: BrokerStreamEvent[] = [];

    open.set(requestId, {
      deliver: (event) => {
        if (!streamOpen) {
          pending.push(event);
          return;
        }
        dispatch(event);
      },
      abort: () => {
        aborted = true;
        resolveDone?.();
      },
    });

    const finalizeBlocks = (partial: AssistantMessage): void => {
      const blocks: AssistantMessage['content'] = [];
      if (thinking.length > 0) blocks.push({ thinking: thinking.join(''), type: 'thinking' });
      if (text.length > 0) blocks.push({ text: text.join(''), type: 'text' });
      for (const call of toolCalls) {
        blocks.push({
          arguments: call.arguments,
          id: call.id,
          name: call.name,
          type: 'toolCall',
        });
      }
      partial.content = blocks;
    };

    const pump = async (): Promise<void> => {
      const partial = makePartial(model);
      try {
        const ack = await link.request('broker.infer', {
          sessionId: sessionId(),
          request: {
            requestId,
            modelRoute: model.id,
            messages,
            maxOutputTokens: options?.maxTokens ?? model.maxTokens,
            tools: sanitizeTools(context),
            thinkingLevel: options?.reasoning,
            serviceTier: options?.serviceTier,
            providerOptions:
              options?.thinkingBudgets !== undefined
                ? { thinkingBudgets: options.thinkingBudgets }
                : undefined,
          },
        });
        if (!isRecord(ack) || ack.accepted !== true) {
          fail('Broker rejected the inference request', aborted);
          return;
        }
        stream.push({ type: 'start', partial });
        streamOpen = true;
        for (const event of pending) dispatch(event);
        pending.length = 0;
        await done;
        if (aborted) {
          fail('Inference aborted', true);
          return;
        }
        if (brokerError !== undefined) {
          fail(brokerError, false);
          return;
        }
        // Close any still-open text/thinking block.
        closeOpenBlock();
        const final = makePartial(model);
        finalizeBlocks(final);
        final.usage = usage;
        final.stopReason = sawToolCalls ? 'toolUse' : 'stop';
        stream.push({ type: 'done', reason: sawToolCalls ? 'toolUse' : 'stop', message: final });
        stream.end(final);
      } catch (error) {
        console.error('broker.infer request failed', error);
        fail(error instanceof Error ? error.message : 'Broker request failed', aborted);
      } finally {
        options?.signal?.removeEventListener('abort', onAbort);
        open.delete(requestId);
      }
    };

    void pump();
    return stream;
  };

  return {
    streamSimple,
    deliverEvent: (params: unknown) => {
      if (!isRecord(params) || typeof params.requestId !== 'string') return;
      const event = params.event;
      if (!isBrokerStreamEvent(event)) return;
      open.get(params.requestId)?.deliver(event);
    },
    abortAll: () => {
      for (const stream of open.values()) stream.abort();
      open.clear();
    },
  };
};
