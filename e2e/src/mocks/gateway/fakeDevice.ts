/**
 * Synthetic `lh hetero exec` device turn for E2E.
 *
 * Real flow: the Orvilo server POSTs `/api/device/agent/run` (an
 * `agent_run_request`) to the agent gateway, which relays it to a connected
 * device; the device's `lh hetero exec` process streams `AgentStreamEvent`s
 * back through tRPC `aiAgent.heteroIngest` and terminates with
 * `aiAgent.heteroFinish`. There is no in-process engine anymore, so a web E2E
 * run without a device lands on the "No device bound" stub.
 *
 * The fake gateway plays the device: `runSyntheticHeteroTurn` consumes a
 * dispatch and streams a mock-LLM reply through the real ingest pipeline, so
 * E2E exercises actual dispatch/admission/persistence/WS fan-out rather than a
 * stubbed send.
 */

export interface DeviceAgentRunRequest {
  agentType?: string;
  assistantMessageId?: string;
  deviceId?: string;
  ingestWorkspaceId?: string;
  jwt?: string;
  operationId?: string;
  prompt?: string;
  runGeneration?: number;
  topicId?: string;
  userId?: string;
}

interface StreamEvent {
  data: Record<string, unknown>;
  operationId: string;
  stepIndex: number;
  timestamp: number;
  type: string;
}

const makeEvent = (
  operationId: string,
  type: string,
  data: Record<string, unknown>,
  stepIndex = 0,
): StreamEvent => ({ data, operationId, stepIndex, timestamp: Date.now(), type });

/**
 * One `aiAgent.heteroIngest`/`heteroFinish` call — superjson httpLink envelope
 * (`{json: input}`), `Oidc-Auth` carrying the operation JWT minted at dispatch.
 */
const callLambdaTrpc = async (
  orviloBaseUrl: string,
  jwt: string,
  procedure: string,
  input: Record<string, unknown>,
  workspaceId?: string,
): Promise<void> => {
  const res = await fetch(`${orviloBaseUrl}/trpc/lambda/${procedure}`, {
    body: JSON.stringify({ json: input }),
    headers: {
      'content-type': 'application/json',
      'oidc-auth': jwt,
      ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
    },
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`${procedure} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
};

const trpcWithRetry = async (
  orviloBaseUrl: string,
  jwt: string,
  procedure: string,
  input: Record<string, unknown>,
  workspaceId?: string,
): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await callLambdaTrpc(orviloBaseUrl, jwt, procedure, input, workspaceId);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
};

/**
 * Ask the mock LLM for the reply. `stream: true` preserves the registered
 * timing knobs (responseDelay / streamChunkSize / streamDelay) so streaming
 * assertions still observe mid-turn growth. Falls back to a short canned
 * reply if the mock is unreachable — the run then still exercises the
 * dispatch path (and surfaces the drift as a content assertion, not a hang).
 */
const fetchMockReply = async (
  llmBaseUrl: string,
  prompt: string,
  onDelta: (text: string) => Promise<void>,
): Promise<string> => {
  const res = await fetch(`${llmBaseUrl}/v1/chat/completions`, {
    body: JSON.stringify({
      messages: [{ content: prompt, role: 'user' }],
      model: 'e2e-mock',
      stream: true,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!res.ok || !res.body) throw new Error(`mock LLM responded ${res.status}`);

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = '';
  let full = '';
  // SSE frames are `\n\n`-separated `data: <json>` lines; keep a tail buffer
  // so a chunk boundary mid-frame doesn't corrupt a delta.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            full += delta;
            await onDelta(full);
          }
        } catch {
          // malformed frame — skip
        }
      }
    }
  }
  return full;
};

export const runSyntheticHeteroTurn = async (params: {
  llmBaseUrl: string;
  orviloBaseUrl: string;
  request: DeviceAgentRunRequest;
}): Promise<void> => {
  const { llmBaseUrl, orviloBaseUrl, request } = params;
  const { agentType, assistantMessageId, ingestWorkspaceId, jwt, operationId, prompt, topicId } =
    request;
  if (!jwt || !operationId || !topicId) {
    console.error('[e2e-gateway] agent_run_request missing jwt/operationId/topicId', {
      operationId,
      topicId,
    });
    return;
  }

  const sessionId = `e2e-sess-${operationId}`;
  const ingestInput = (events: StreamEvent[]) => ({
    agentType: agentType ?? 'claude-code',
    assistantMessageId,
    events,
    operationId,
    ...(request.runGeneration === undefined ? {} : { runGeneration: request.runGeneration }),
    topicId,
  });

  try {
    await trpcWithRetry(
      orviloBaseUrl,
      jwt,
      'aiAgent.heteroIngest',
      ingestInput([
        makeEvent(operationId, 'stream_start', {
          model: 'e2e-mock',
          provider: agentType ?? 'claude-code',
          sessionId,
        }),
      ]),
      ingestWorkspaceId,
    );

    // Stream the reply the way a real device does: pump one `stream_chunk`
    // `replace` snapshot per ingest as mock-LLM deltas land. An ingest call
    // costs a full persistence+publish flush (~700ms), so the pump's natural
    // cadence resembles live token streaming — small early snapshots, growing
    // later ones — which is what the pin-scroll journeys need: text arriving
    // in a single burst collapses the bottom-compensation spacer in one frame
    // (recorded as "jump") instead of sliding across frames.
    const terminal = [
      makeEvent(operationId, 'stream_end', {}),
      makeEvent(operationId, 'visible_output_end', {}),
      makeEvent(operationId, 'agent_runtime_end', {}),
    ];
    let latest = '';
    let streamDone = false;
    let streamError: unknown;
    const replyPromise = fetchMockReply(llmBaseUrl, prompt ?? '', async (full) => {
      latest = full;
    })
      .then(() => {
        streamDone = true;
      })
      .catch((error) => {
        streamError = error;
        streamDone = true;
      });

    let lastSentLength = 0;
    let snapshotSeq = 0;
    let terminalSent = false;
    while (!streamDone || latest.length > lastSentLength) {
      const end = latest.length;
      if (end === lastSentLength) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        continue;
      }
      snapshotSeq += 1;
      const events: StreamEvent[] = [
        makeEvent(operationId, 'stream_chunk', {
          chunkType: 'text',
          content: latest.slice(0, end),
          snapshotMode: 'replace',
          snapshotSeq,
        }),
      ];
      // Attach terminal events to the final chunk once the stream is over so
      // they cannot interleave with later chunks across separate calls.
      const isFinal = streamDone;
      if (isFinal) {
        events.push(...terminal);
        terminalSent = true;
      }
      await trpcWithRetry(
        orviloBaseUrl,
        jwt,
        'aiAgent.heteroIngest',
        ingestInput(events),
        ingestWorkspaceId,
      );
      lastSentLength = end;
    }
    if (streamError) {
      throw streamError;
    }
    if (!terminalSent) {
      await trpcWithRetry(
        orviloBaseUrl,
        jwt,
        'aiAgent.heteroIngest',
        ingestInput(terminal),
        ingestWorkspaceId,
      );
    }
    await replyPromise;

    await trpcWithRetry(
      orviloBaseUrl,
      jwt,
      'aiAgent.heteroFinish',
      {
        agentType: agentType ?? 'claude-code',
        assistantMessageId,
        operationId,
        ...(request.runGeneration === undefined ? {} : { runGeneration: request.runGeneration }),
        result: 'success',
        sessionId,
        topicId,
      },
      ingestWorkspaceId,
    );
  } catch (error) {
    // Surface the failure on the assistant message instead of stranding the
    // operation — mirrors `lh` reporting a process-level abort.
    console.error('[e2e-gateway] synthetic hetero turn failed:', error);
    try {
      await trpcWithRetry(
        orviloBaseUrl,
        jwt,
        'aiAgent.heteroFinish',
        {
          agentType: agentType ?? 'claude-code',
          assistantMessageId,
          error: { message: String(error), type: 'E2EFakeDeviceError' },
          operationId,
          result: 'error',
          topicId,
        },
        ingestWorkspaceId,
      );
    } catch (finishError) {
      console.error('[e2e-gateway] synthetic hetero finish also failed:', finishError);
    }
  }
};
