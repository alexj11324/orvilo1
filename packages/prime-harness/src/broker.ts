/**
 * The `orvilo-broker` provider — the only way inference leaves the runner.
 *
 * Every upstream model call routes through `streamSimple`, which converts the
 * upstream Context into a SANITIZED InferenceRequest (no endpoints, headers,
 * or credentials — the runner never holds any) and issues `broker.infer` over
 * the host link. `broker.event` notifications stream the answer back into an
 * AssistantMessageEventStream.
 */

import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Usage,
} from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type {
  BrokerStreamEvent,
  SanitizedInferenceMessage,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
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

const messageText = (message: Message): string | undefined => {
  if (message.role === 'toolResult') return undefined;
  if (typeof message.content === 'string') return message.content;
  const text = message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('');
  return text.length > 0 ? text : undefined;
};

/**
 * Context → sanitized wire messages. Content that cannot be expressed as text
 * (images, tool calls, tool results) makes the request invalid rather than
 * silently dropped — a richer projection is phase 3.
 */
const sanitizeMessages = (context: Context): SanitizedInferenceMessage[] | undefined => {
  const out: SanitizedInferenceMessage[] = [];
  if (typeof context.systemPrompt === 'string' && context.systemPrompt.length > 0) {
    out.push({ role: 'system', content: context.systemPrompt });
  }
  for (const message of context.messages) {
    const text = messageText(message);
    if (text === undefined) return undefined;
    if (message.role === 'assistant') out.push({ role: 'assistant', content: text });
    else if (message.role === 'user') out.push({ role: 'user', content: text });
    else return undefined;
  }
  return out.length > 0 ? out : undefined;
};

const isBrokerStreamEvent = (event: unknown): event is BrokerStreamEvent => {
  if (!isRecord(event) || typeof event.type !== 'string') return false;
  switch (event.type) {
    case 'text': {
      return typeof event.text === 'string';
    }
    case 'usage': {
      return typeof event.inputTokens === 'number' && typeof event.outputTokens === 'number';
    }
    case 'error': {
      return typeof event.message === 'string';
    }
    case 'end': {
      return true;
    }
    default: {
      return false;
    }
  }
};

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

export const createBrokerBridge = (link: RunnerLink, sessionId: string): BrokerBridge => {
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
      fail('Request context contains content the broker cannot carry (tools or media)', false);
      return stream;
    }

    const text: string[] = [];
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

    // Events can outrun `broker.infer`'s ack; text deltas pushed before the
    // stream's `text_start` are dropped upstream, so queue until the pump
    // opens the stream, then flush in order.
    let streamOpen = false;
    const pending: BrokerStreamEvent[] = [];
    const dispatch = (event: BrokerStreamEvent): void => {
      switch (event.type) {
        case 'text': {
          text.push(event.text);
          const partial = makePartial(model);
          partial.content = [{ type: 'text', text: text.join('') }];
          stream.push({ type: 'text_delta', contentIndex: 0, delta: event.text, partial });
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
    const flush = (): void => {
      streamOpen = true;
      for (const event of pending) dispatch(event);
      pending.length = 0;
    };

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

    const pump = async (): Promise<void> => {
      const partial = makePartial(model);
      try {
        const ack = await link.request('broker.infer', {
          sessionId,
          request: {
            requestId,
            modelRoute: model.id,
            messages,
            maxOutputTokens: options?.maxTokens ?? model.maxTokens,
          },
        });
        if (!isRecord(ack) || ack.accepted !== true) {
          fail('Broker rejected the inference request', aborted);
          return;
        }
        stream.push({ type: 'start', partial });
        stream.push({ type: 'text_start', contentIndex: 0, partial });
        flush();
        await done;
        if (aborted) {
          fail('Inference aborted', true);
          return;
        }
        if (brokerError !== undefined) {
          fail(brokerError, false);
          return;
        }
        stream.push({ type: 'text_end', contentIndex: 0, content: text.join(''), partial });
        const final = makePartial(model);
        final.content = [{ type: 'text', text: text.join('') }];
        final.usage = usage;
        final.stopReason = 'stop';
        stream.push({ type: 'done', reason: 'stop', message: final });
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
      if (!isRecord(event) || typeof event.type !== 'string') return;
      if (!isBrokerStreamEvent(event)) return;
      open.get(params.requestId)?.deliver(event);
    },
    abortAll: () => {
      for (const stream of open.values()) stream.abort();
      open.clear();
    },
  };
};
