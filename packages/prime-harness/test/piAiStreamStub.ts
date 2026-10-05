/**
 * Vitest stub for `@earendil-works/pi-ai` — the vendored package only resolves
 * through the esbuild bundle, so unit tests alias it here. Implements the one
 * runtime surface the broker bridge uses: a queue-backed
 * AssistantMessageEventStream where `push` before iteration buffers and `end`
 * flushes buffered events before completing.
 */
import type { AssistantMessageEvent, AssistantMessageEventStream } from '@earendil-works/pi-ai';

export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  const buffered: AssistantMessageEvent[] = [];
  const waiting: ((step: IteratorResult<AssistantMessageEvent>) => void)[] = [];
  let ended = false;
  return {
    push: (event) => {
      const waiter = waiting.shift();
      if (waiter) waiter({ done: false, value: event });
      else buffered.push(event);
    },
    end: () => {
      ended = true;
      for (const waiter of waiting.splice(0)) waiter({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise((resolve) => {
            const bufferedEvent = buffered.shift();
            if (bufferedEvent !== undefined) resolve({ done: false, value: bufferedEvent });
            else if (ended) resolve({ done: true, value: undefined });
            else waiting.push(resolve);
          }),
      };
    },
  };
}
