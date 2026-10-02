// @vitest-environment node
/**
 * Phase 6 acceptance — protocol suite.
 *
 * Spawns the REAL runner artifact (`packages/prime-harness/dist/runner.mjs`)
 * as a plain child process and drives it through the production
 * HarnessTransport. These are the exact frames the host sends; the transcript
 * of the handshake test doubles as the PR evidence capture.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import type {
  HarnessInitAck,
  HarnessPromptResult,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { HARNESS_PROTOCOL_VERSION } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { describe, expect, it } from 'vitest';

import {
  runnerAvailable,
  spawnRunner,
  waitFor,
  writeTranscript,
} from './embeddedAcceptance.support';

const RUNNER_UP = runnerAvailable();

/** The pin the runner must echo — vendored pi-coding-agent@0.9.8, MIT. */
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

interface BrokerInferParams {
  request: {
    maxOutputTokens: number;
    messages: { content: string; role: string }[];
    modelRoute: string;
    requestId: string;
  };
  sessionId: string;
}

describe.skipIf(!RUNNER_UP)('embedded acceptance: protocol (real runner process)', () => {
  it(
    'completes init handshake, prompt→text round-trip and clean exit',
    { timeout: 60_000 },
    async () => {
      const runner = spawnRunner();
      try {
        runner.transport.setReverseHandler((method, params) => {
          if (method === 'broker.infer') {
            const infer = params as BrokerInferParams;
            queueMicrotask(() => {
              runner.transport.notify('broker.event', {
                event: { text: 'acceptance reply', type: 'text' },
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

        const ack = (await runner.transport.request('harness.init', initParams)) as HarnessInitAck;
        expect(ack.sessionId).toMatch(/^embedded-/);
        expect(ack.protocolVersion).toBe(HARNESS_PROTOCOL_VERSION);
        expect(ack.pin).toEqual(EXPECTED_PIN);
        expect(ack.capabilities).toEqual({
          cancel: true,
          prompt: true,
          requests: ['broker.infer', 'broker.cancel'],
          stream: true,
          tools: [],
        });

        const prompt = (await runner.transport.request('session.prompt', {
          sessionId: ack.sessionId,
          text: 'hello runner',
        })) as HarnessPromptResult;
        expect(prompt).toEqual({ stopReason: 'end_turn' });

        // Transcript evidence: exactly one broker.infer, with host-pinned route
        // (the init ack also names the method in capabilities.requests — match
        // on the frame's method field, not the substring).
        const inferFrames = runner.transcript.filter((frame) => {
          if (frame.direction !== 'runner-to-host') return false;
          const parsed = JSON.parse(frame.line) as { method?: string };
          return parsed.method === 'broker.infer';
        });
        expect(inferFrames).toHaveLength(1);
        const infer = JSON.parse(inferFrames[0].line) as {
          method: string;
          params: BrokerInferParams;
        };
        expect(infer.params.sessionId).toBe(ack.sessionId);
        expect(infer.params.request.modelRoute).toBe('stub-model-1');
        expect(infer.params.request.maxOutputTokens).toBe(8192);
        // The vendored agent prepends its own harness preamble; the runner
        // must carry the user turn verbatim as the final message.
        expect(infer.params.request.messages.at(-1)).toEqual({
          content: 'hello runner',
          role: 'user',
        });
        expect(infer.params.request.requestId).toMatch(/^infer-/);

        // Quiescence: closing the channel makes PID 1 exit 0 on its own.
        runner.transport.close();
        const code = await Promise.race([
          runner.exited,
          new Promise<number>((_, reject) =>
            setTimeout(() => reject(new Error('runner did not exit')), 10_000),
          ),
        ]);
        expect(code).toBe(0);

        if (process.env.PRIME_ACCEPTANCE_TRANSCRIPT_DIR) {
          const dir = process.env.PRIME_ACCEPTANCE_TRANSCRIPT_DIR;
          await mkdir(dir, { recursive: true });
          await writeTranscript(path.join(dir, 'protocol-handshake.jsonl'), runner.transcript);
        }
      } finally {
        runner.child.kill('SIGKILL');
      }
    },
  );

  it(
    'cancels an in-flight prompt: session.abort → broker.cancel → cancelled',
    { timeout: 60_000 },
    async () => {
      const runner = spawnRunner();
      try {
        let sawCancel: string | undefined;
        runner.transport.setReverseHandler((method, params) => {
          if (method === 'broker.infer') {
            const infer = params as BrokerInferParams;
            // Never stream events — keeps the infer open until cancelled.
            return { result: { accepted: true, requestId: infer.request.requestId } };
          }
          if (method === 'broker.cancel') {
            sawCancel = (params as { requestId: string }).requestId;
            return { result: { cancelled: true } };
          }
          return { error: { code: -32601, message: `unexpected ${method}` } };
        });

        const ack = (await runner.transport.request('harness.init', initParams)) as HarnessInitAck;
        const prompting = runner.transport.request('session.prompt', {
          sessionId: ack.sessionId,
          text: 'long running',
        });
        await waitFor(() =>
          runner.transcript.some(
            (frame) =>
              frame.direction === 'runner-to-host' &&
              frame.line.includes('"method":"broker.infer"'),
          ),
        );
        runner.transport.notify('session.abort', { sessionId: ack.sessionId });
        const result = (await prompting) as HarnessPromptResult;
        expect(result).toEqual({ stopReason: 'cancelled' });
        await waitFor(() => sawCancel !== undefined);
        expect(sawCancel).toMatch(/^infer-/);
        runner.transport.close();
        expect(await runner.exited).toBe(0);
      } finally {
        runner.child.kill('SIGKILL');
      }
    },
  );

  it(
    'fails closed on malformed ndjson, wrong-version and oversized frames',
    { timeout: 60_000 },
    async () => {
      // Each invalid frame kills the runner on its own — spawn fresh so the
      // exit can't be attributed to an earlier write racing the EOF.
      const expectKilled = async (frame: string) => {
        const runner = spawnRunner();
        try {
          runner.child.stdin.on('error', () => {}); // EPIPE after exit is fine
          runner.child.stdin.write(frame);
          const code = await Promise.race([
            runner.exited,
            new Promise<number>((_, reject) =>
              setTimeout(() => reject(new Error('runner stayed up after bad frames')), 10_000),
            ),
          ]);
          expect(code).toBe(0);
        } finally {
          runner.child.kill('SIGKILL');
        }
      };
      await expectKilled('not json\n');
      await expectKilled('{"jsonrpc":"1.0","method":"x"}\n');
      await expectKilled(`${' '.repeat(1_100_000)}\n`);
    },
  );

  it(
    'rejects unknown methods and bad init params over the wire, staying alive',
    { timeout: 30_000 },
    async () => {
      const runner = spawnRunner();
      try {
        await expect(runner.transport.request('harness.bogus', {})).rejects.toThrow(
          /Harness request failed/,
        );
        await expect(
          runner.transport.request('harness.init', { protocolVersion: 999 }),
        ).rejects.toThrow(/Harness request failed/);
        // Errors are wire-level, not fatal — the process is still alive.
        expect(runner.child.exitCode).toBeNull();
        runner.transport.close();
        expect(await runner.exited).toBe(0);
      } finally {
        runner.child.kill('SIGKILL');
      }
    },
  );

  it(
    'runner echoes only the compiled-in pin — host-side drift is undetectable to it',
    { timeout: 30_000 },
    async () => {
      // The host's defense is comparing the acked pin to the manifest/build
      // pin (embeddedArtifactVerifier); the runner itself will accept whatever
      // pin params it is offered and still report the real compiled pin.
      const runner = spawnRunner();
      try {
        const ack = (await runner.transport.request('harness.init', {
          ...initParams,
          pin: { commit: 'deadbeef'.repeat(8), license: 'BSD-0', version: '9.9.9' },
        })) as HarnessInitAck;
        expect(ack.pin).toEqual(EXPECTED_PIN);
        runner.transport.close();
        expect(await runner.exited).toBe(0);
      } finally {
        runner.child.kill('SIGKILL');
      }
    },
  );
});
