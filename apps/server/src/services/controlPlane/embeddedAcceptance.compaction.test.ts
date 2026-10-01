// @vitest-environment node
/**
 * Phase 6 acceptance — compaction/resume path.
 *
 * What this suite proves with REAL processes:
 *  - `PrimeEmbeddedRuntime.resume` is fail-closed (`unsupported_capability`,
 *    `capabilities.resume === 'none'`) — durable-session resume is v2 scope by
 *    design (prime-embedded-harness-design §6).
 *  - A first prompt that overflows the runner's hardcoded 128k context window
 *    makes the vendored compaction machinery issue its summarization call —
 *    `completeSimple(model, {systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, ...})`
 *    in vendor/prime/packages/coding-agent/src/core/compaction/compaction.ts —
 *    through the SAME broker.infer wire. The frame's messages[0] is the
 *    vendored `system` summarization prompt, observed verbatim on the real
 *    ndjson link: compaction inference can ONLY exit through the host broker
 *    because 'orvilo-broker' is the sole registered provider in the child.
 *
 * No LLM is involved — the host answers every broker.infer with a fixed
 * stream, which is exactly what the broker contract looks like to the runner
 * (the shape is identical to what completeSimple emits).
 */
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import type { BrokerInferParams } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { HARNESS_PROTOCOL_VERSION } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { PrimeEmbeddedRuntime } from '@orvilo/agent-execution/controlPlane/server';
import { describe, expect, it } from 'vitest';

import { runnerAvailable, spawnRunner } from './embeddedAcceptance.support';

const RUNNER_UP = runnerAvailable();

const EXPECTED_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  license: 'MIT',
  version: '0.9.8',
} as const;

const initParams = {
  controlPlaneVersion: CONTROL_PLANE_VERSION,
  model: { id: 'stub-model-1', maxOutputTokens: 8192 },
  pin: EXPECTED_PIN,
  protocolVersion: HARNESS_PROTOCOL_VERSION,
  workspace: '/workspace',
};

describe('embedded acceptance: resume is fail-closed (v1 deferral)', () => {
  it('PrimeEmbeddedRuntime.resume returns unsupported_capability and advertises none', async () => {
    const runtime = new PrimeEmbeddedRuntime();
    expect(runtime.capabilities().resume).toBe('none');
    const resumed = await runtime.resume({
      session: {
        fence: {
          epoch: 1,
          grantId: 'g',
          leaseId: 'l',
          ownerId: 'o',
          policyRevision: 1,
          principalId: 'p',
          stateRevision: 1,
          taskId: 't',
          tenantId: 'w',
        },
        runtimeId: 'prime-embedded',
        sessionId: 'embedded-x',
      },
    });
    expect(resumed).toMatchObject({
      error: { code: 'unsupported_capability' },
      ok: false,
    });
  });
});

describe.skipIf(!RUNNER_UP)(
  'embedded acceptance: compaction summarization crosses the real wire',
  () => {
    it(
      'an over-window first prompt forces the vendored compaction call through broker.infer',
      { timeout: 120_000 },
      async () => {
        const runner = spawnRunner();
        try {
          const infers: BrokerInferParams['request'][] = [];
          runner.transport.setReverseHandler((method, params) => {
            if (method === 'broker.infer') {
              const infer = params as BrokerInferParams;
              infers.push(infer.request);
              // Answer like the host broker does: ack, text stream, end.
              // Threshold compaction keys off the last reported usage, so the
              // third turn reports 127k input tokens — just under the runner
              // model's 128k window — to force a threshold compaction; every
              // other call reports tiny usage so the check settles.
              queueMicrotask(() => {
                const inputTokens = infers.length === 3 ? 127_000 : 9;
                runner.transport.notify('broker.event', {
                  event: { text: 'summary reply', type: 'text' },
                  requestId: infer.request.requestId,
                });
                runner.transport.notify('broker.event', {
                  event: { inputTokens, outputTokens: 3, type: 'usage' },
                  requestId: infer.request.requestId,
                });
                runner.transport.notify('broker.event', {
                  event: { type: 'end' },
                  requestId: infer.request.requestId,
                });
              });
              return { result: { accepted: true, requestId: infer.request.requestId } };
            }
            return { error: { code: -32601, message: `unexpected ${method}` } };
          });

          const ack = (await runner.transport.request('harness.init', initParams)) as {
            sessionId: string;
          };

          // Build real history first: the compaction keep-window retains the
          // most recent ~20k tokens, so a big second prompt leaves turn 1
          // inside the summarized region. The threshold check reads the
          // assistant turn's reported usage — the 127k comes from the usage
          // event on the third turn.
          const p1 = (await runner.transport.request('session.prompt', {
            sessionId: ack.sessionId,
            text: 'history seed turn',
          })) as { stopReason: string };
          const p2 = (await runner.transport.request('session.prompt', {
            sessionId: ack.sessionId,
            text: 'context filler. '.repeat(6_000),
          })) as { stopReason: string };
          const prompt = (await runner.transport.request('session.prompt', {
            sessionId: ack.sessionId,
            text: 'trigger compaction',
          })) as { stopReason: string };
          console.error(
            'compaction prompts: %s %s %s',
            p1.stopReason,
            p2.stopReason,
            prompt.stopReason,
          );

          // Whatever the turn's end state, the compaction attempt is the
          // evidence: a broker.infer whose messages[0] is the vendored
          // SUMMARIZATION_SYSTEM_PROMPT proves completeSimple exits through
          // the same stdio broker — there is no other egress in the child.
          const summary = infers.find((request) =>
            request.messages.some(
              (m) => m.role === 'system' && m.content.includes('context summarization assistant'),
            ),
          );
          console.error(
            'compaction evidence: stopReason=%s infers=%d summaryInfer=%s',
            prompt.stopReason,
            infers.length,
            summary ? 'seen' : 'absent',
          );
          expect(summary, 'vendored compaction issued no summarization infer').toBeTruthy();
          expect(summary?.messages[0].content).toContain('context summarization assistant');
        } finally {
          runner.transport.close();
          runner.child.kill('SIGKILL');
          await runner.exited;
        }
      },
    );
  },
);
