import { isRecord, toRecord } from '@orvilo/utils/object';

import type { HeterogeneousAgentEvent, ToolCallPayload } from '../types';

/**
 * Shared stream/step lifecycle for ACP `sessionUpdate` adapters.
 *
 * ACP does not frame model rounds explicitly, so adapters detect step
 * boundaries themselves (tool completion, response completion, …) and set
 * {@link pendingStepBoundary}. The next `ensureStream(true)` call consumes the
 * boundary: it closes the open stream, bumps `stepIndex`, resets the per-step
 * tool list, and re-opens a stream whose `stream_start` payload comes from the
 * adapter-provided builder (which appends `newStep` for steps > 0).
 */
export class AcpStreamLifecycle {
  /** Set by the adapter when the next model round must open a new step. */
  pendingStepBoundary = false;
  stepIndex = 0;
  /** Tool calls announced within the current step (reset at each boundary). */
  stepTools: ToolCallPayload[] = [];
  streamOpen = false;

  constructor(private readonly buildStreamStartData: (stepIndex: number) => unknown) {}

  event(type: HeterogeneousAgentEvent['type'], data: unknown): HeterogeneousAgentEvent {
    return { data, stepIndex: this.stepIndex, timestamp: Date.now(), type };
  }

  ensureStream(consumeStepBoundary: boolean): HeterogeneousAgentEvent[] {
    const events: HeterogeneousAgentEvent[] = [];
    if (consumeStepBoundary && this.pendingStepBoundary) {
      events.push(...this.closeStream());
      this.pendingStepBoundary = false;
      this.stepIndex += 1;
      this.stepTools = [];
    }
    if (this.streamOpen) return events;

    this.streamOpen = true;
    events.push(this.event('stream_start', this.buildStreamStartData(this.stepIndex)));
    return events;
  }

  closeStream(data: unknown = {}): HeterogeneousAgentEvent[] {
    if (!this.streamOpen) return [];
    this.streamOpen = false;
    return [this.event('stream_end', data)];
  }
}

/**
 * Read the text out of one ACP ContentBlock-ish value: plain strings, `text`
 * blocks, nested `content` wrappers, and the `diff` / `output` string fields
 * some agents put on tool-call content.
 */
export const acpContentBlockText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  if (value.type === 'text' && typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (isRecord(value.content)) return acpContentBlockText(value.content);
  if (typeof value.diff === 'string') return value.diff;
  if (typeof value.output === 'string') return value.output;
  return '';
};

/**
 * ACP extension marker for replayed history: `_meta.isReplay` on either the
 * notification `params` or the nested `update`.
 */
export const isAcpReplayMessage = (raw: unknown): boolean => {
  const params = toRecord(toRecord(raw)?.params);
  const update = toRecord(params?.update);
  return toRecord(params?._meta)?.isReplay === true || toRecord(update?._meta)?.isReplay === true;
};

/** ACP extension dedup marker: `_meta.eventId` on the notification `params`. */
export const acpEventIdOf = (raw: unknown): string | undefined => {
  const meta = toRecord(toRecord(toRecord(raw)?.params)?._meta);
  return typeof meta?.eventId === 'string' ? meta.eventId : undefined;
};

/** Longest session title forwarded from an agent; longer text is cut. */
export const MAX_ACP_SESSION_TITLE_LENGTH = 100;

/** Whitespace-like controls that separate words: become one space, never vanish. */
const TITLE_SEPARATORS = /[\t\n\v\f\r\u0085\u2028\u2029]/gu;

/**
 * Everything invisible, removed outright (`a<ZWSP>b` -> `ab`): all of
 * \p{C} (controls, format incl. zero-width / bidi / tag characters, lone
 * surrogates, private use, unassigned), line/paragraph separators, and the
 * invisible fillers and joiners outside those categories (CGJ, Hangul fillers,
 * Mongolian variation selectors). A ZWJ is kept only between two pictographs,
 * so a family emoji survives while a hidden joiner in text does not.
 */
/* eslint-disable no-misleading-character-class -- the class deliberately lists combining marks (U+034F, U+180B-U+180F) to remove them */
const INVISIBLE_CLASS = String.raw`\p{C}\p{Zl}\p{Zp}\u034F\u115F\u1160\u3164\uFFA0\u180B-\u180F\u2800`;
const INVISIBLE_TITLE_CHARS = new RegExp(
  String.raw`(?<keep>(?<=\p{Extended_Pictographic}\uFE0F?)\u200D(?=\p{Extended_Pictographic}))|[${INVISIBLE_CLASS}]`,
  'gu',
);
/* eslint-enable no-misleading-character-class */

/** A title must show at least one letter, number, punctuation mark or symbol (emoji count). */
const VISIBLE_TITLE_CHAR = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * Title carried by an ACP `session_info_update` (`sessionUpdate` payload).
 *
 * Returns the trimmed, length-capped title only when it is a non-blank string.
 * An omitted field means "unchanged", `null` means "cleared", and a
 * `_meta`-only update is routine bookkeeping (the bundled Prime agent sends
 * many); none of those is a title, so they all return `undefined`. The text is
 * untrusted agent output: plain string only, newlines flattened.
 */
export const parseAcpSessionTitle = (update: unknown): string | undefined => {
  const record = toRecord(update);
  if (record?.sessionUpdate !== 'session_info_update') return undefined;
  if (typeof record.title !== 'string') return undefined;

  // Word separators first, then drop invisible characters (they would
  // survive whitespace collapsing and could hide or reorder text), collapse
  // whitespace, and cap by code points so no surrogate pair is split.
  const printable = record.title
    .replaceAll(TITLE_SEPARATORS, ' ')
    .replaceAll(INVISIBLE_TITLE_CHARS, (match, ...rest) => {
      const groups = rest.at(-1) as { keep?: string };
      return groups.keep ? match : '';
    });
  const title = [...printable.replaceAll(/\s+/gu, ' ').trim()]
    .slice(0, MAX_ACP_SESSION_TITLE_LENGTH)
    .join('')
    .trim();
  if (!VISIBLE_TITLE_CHAR.test(title)) return undefined;
  return title || undefined;
};

/**
 * {@link parseAcpSessionTitle} for a whole JSON-RPC message: only a live
 * `session/update` notification counts, never a replayed historical one.
 */
export const parseAcpSessionTitleMessage = (message: {
  method?: string;
  params?: unknown;
}): string | undefined => {
  if (message.method !== 'session/update' || isAcpReplayMessage(message)) return undefined;
  return parseAcpSessionTitle(toRecord(message.params)?.update);
};
