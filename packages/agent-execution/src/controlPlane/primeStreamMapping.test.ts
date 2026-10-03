// @vitest-environment node
import type { ChatToolPayload } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from './contracts';
import type { HarnessSessionEvent } from './harnessProtocol';
import {
  createPrimeStreamState,
  mapHarnessSessionEvent,
  mapRuntimeEvent,
} from './primeStreamMapping';

const thinking: HarnessSessionEvent = { kind: 'thinking', text: 'hmm' };

const toolCall: HarnessSessionEvent = {
  args: { code: 'print(1)' },
  kind: 'tool_call',
  toolCallId: 'call_1',
  toolName: 'ipython',
};

const toolProgress: HarnessSessionEvent = {
  kind: 'tool_progress',
  partialResult: { content: [{ text: 'partial', type: 'text' }] },
  toolCallId: 'call_1',
  toolName: 'ipython',
};

const toolResult: HarnessSessionEvent = {
  isError: false,
  kind: 'tool_result',
  result: { content: [{ text: '1', type: 'text' }], details: { cwd: '/tmp' } },
  toolCallId: 'call_1',
  toolName: 'ipython',
};

describe('mapHarnessSessionEvent', () => {
  it('maps thinking onto a reasoning stream chunk', () => {
    const [emission] = mapHarnessSessionEvent(createPrimeStreamState(), thinking);
    expect(emission).toEqual({
      data: { chunkType: 'reasoning', reasoning: 'hmm' },
      type: 'stream_chunk',
    });
  });

  it('emits cumulative tools_calling + tool_start on tool_call', () => {
    const state = createPrimeStreamState();
    const emissions = mapHarnessSessionEvent(state, toolCall);
    expect(emissions).toHaveLength(2);
    const [chunk, start] = emissions;
    expect(chunk.type).toBe('stream_chunk');
    expect(chunk.data.chunkType).toBe('tools_calling');
    expect(chunk.data.toolsCalling).toEqual([
      {
        apiName: 'ipython',
        arguments: '{"code":"print(1)"}',
        id: 'call_1',
        identifier: 'orvilo',
        type: 'default',
      },
    ]);
    const toolsCalling = chunk.data.toolsCalling as ChatToolPayload[];
    expect(start).toEqual({
      data: {
        toolCalling: toolsCalling[0],
        toolCallId: 'call_1',
      },
      type: 'tool_start',
    });

    // A second call accumulates instead of replacing — same contract as
    // the hetero pi adapter's stepToolCalls.
    const second = mapHarnessSessionEvent(state, {
      ...toolCall,
      toolCallId: 'call_2',
      toolName: 'bash',
    });
    expect(second[0].data.toolsCalling).toHaveLength(2);
  });

  it('emits monotonic tool_state snapshots per toolCallId', () => {
    const state = createPrimeStreamState();
    mapHarnessSessionEvent(state, toolCall);
    const [a] = mapHarnessSessionEvent(state, toolProgress);
    const [b] = mapHarnessSessionEvent(state, toolProgress);
    expect(a.data).toMatchObject({
      chunkType: 'tool_state',
      snapshotMode: 'replace',
      snapshotSeq: 1,
      toolCallId: 'call_1',
    });
    expect(b.data.snapshotSeq).toBe(2);
  });

  it('emits tool_result + tool_end with the re-attached payload', () => {
    const state = createPrimeStreamState();
    mapHarnessSessionEvent(state, toolCall);
    const emissions = mapHarnessSessionEvent(state, toolResult);
    expect(emissions).toHaveLength(2);
    const [result, end] = emissions;
    expect(result).toMatchObject({
      data: { content: '1', isError: false, state: { cwd: '/tmp' }, toolCallId: 'call_1' },
      type: 'tool_result',
    });
    expect(end).toEqual({
      data: {
        isSuccess: true,
        payload: { toolCalling: state.toolCalls[0] },
        result: { content: '1', state: { cwd: '/tmp' }, success: true },
        toolCallId: 'call_1',
      },
      type: 'tool_end',
    });
  });

  it('marks failed tool results isSuccess:false once', () => {
    const state = createPrimeStreamState();
    mapHarnessSessionEvent(state, toolCall);
    const failed: HarnessSessionEvent = { ...toolResult, isError: true };
    const [, end] = mapHarnessSessionEvent(state, failed);
    expect(end.data.isSuccess).toBe(false);
    // Duplicate result (retry) is deduped like the hetero adapter.
    expect(mapHarnessSessionEvent(state, failed)).toHaveLength(0);
  });

  it('ignores non-surfacing kinds', () => {
    const state = createPrimeStreamState();
    expect(mapHarnessSessionEvent(state, { kind: 'text', text: 'hi' })).toHaveLength(0);
    expect(mapHarnessSessionEvent(state, { kind: 'error', message: 'x' })).toHaveLength(0);
  });

  it('emits subagent_update chunks carrying hetero spawn context once', () => {
    const state = createPrimeStreamState();
    const child = {
      id: 'rlm-child-1',
      label: 'researcher',
      prompt: 'find the bug',
      sessionName: 'child-sess',
      status: 'running' as const,
    };
    const [first] = mapHarnessSessionEvent(state, { child, kind: 'subagent_update' });
    expect(first).toEqual({
      data: {
        chunkType: 'subagent_update',
        snapshot: child,
        subagent: {
          parentToolCallId: 'rlm-child-1',
          spawnMetadata: {
            description: 'child-sess',
            prompt: 'find the bug',
            subagentType: 'rlm',
          },
        },
      },
      type: 'stream_chunk',
    });
    // Second update for the same child — spawnMetadata appears exactly once.
    const [second] = mapHarnessSessionEvent(state, {
      child: { ...child, status: 'done' },
      kind: 'subagent_update',
    });
    expect(second.data.subagent).toEqual({ parentToolCallId: 'rlm-child-1' });
  });

  it('surfaces child progress notes and errors inside the child thread', () => {
    const state = createPrimeStreamState();
    const emissions = mapHarnessSessionEvent(state, {
      child: { id: 'rlm-9', progressNote: 'halfway', status: 'running' },
      kind: 'subagent_update',
    });
    expect(emissions).toHaveLength(2);
    expect(emissions[1]).toEqual({
      data: {
        chunkType: 'reasoning',
        reasoning: 'halfway',
        subagent: {
          parentToolCallId: 'rlm-9',
          spawnMetadata: { description: undefined, prompt: undefined, subagentType: 'rlm' },
        },
      },
      type: 'stream_chunk',
    });
    const withError = mapHarnessSessionEvent(state, {
      child: { error: 'boom', id: 'rlm-9', status: 'error' },
      kind: 'subagent_update',
    });
    expect(withError.at(-1)).toEqual({
      data: { message: 'boom', subagent: { parentToolCallId: 'rlm-9' } },
      type: 'error',
    });
  });

  it('stamps subagent context on tool/thinking events from a child stream', () => {
    const state = createPrimeStreamState();
    const subagent = { childId: 'rlm-4', name: 'writer' };
    const emissions = mapHarnessSessionEvent(state, {
      args: { code: 'x' },
      kind: 'tool_call',
      subagent,
      toolCallId: 'call_s',
      toolName: 'ipython',
    });
    for (const emission of emissions) {
      expect(emission.data.subagent).toMatchObject({ parentToolCallId: 'rlm-4' });
    }
    const [think] = mapHarnessSessionEvent(state, {
      kind: 'thinking',
      subagent,
      text: 'pondering',
    });
    expect(think.data.subagent).toEqual({ parentToolCallId: 'rlm-4' });
  });

  it('routes a child-emitted subagent_update under the emitter, not the subject', () => {
    const state = createPrimeStreamState();
    // Session rlm-parent emits an update about ITS child rlm-grand — the
    // stamp scopes the chunk into rlm-parent's own thread.
    const [emission] = mapHarnessSessionEvent(state, {
      child: { id: 'rlm-grand', status: 'running' },
      kind: 'subagent_update',
      subagent: { childId: 'rlm-parent' },
    });
    expect(emission.data.subagent).toMatchObject({ parentToolCallId: 'rlm-parent' });
  });
});

describe('mapRuntimeEvent', () => {
  it('maps the RuntimeEvent union through the same ledger shapes', () => {
    const state = createPrimeStreamState();
    const event: RuntimeEvent = {
      args: { code: 'x' },
      sessionId: 's',
      toolCallId: 'c',
      toolName: 'ipython',
      type: 'tool_call',
    };
    const emissions = mapRuntimeEvent(state, event);
    expect(emissions).toHaveLength(2);
    expect(
      mapRuntimeEvent(state, {
        sessionId: 's',
        text: 'think',
        type: 'thinking',
      })[0].data,
    ).toEqual({ chunkType: 'reasoning', reasoning: 'think' });
  });
});
