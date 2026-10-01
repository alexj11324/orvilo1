/** Provider-free fixture history written through pinned upstream SessionManager. Container only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

import { SessionManager } from '/opt/prime/packages/coding-agent/dist/core/session-manager.js';

const processes = [];
function start(args = [], home = '/tmp') {
  const child = spawn('/usr/local/bin/prime-pinned', ['--mode', 'rpc', ...args], {
    cwd: '/workspace',
    env: { HOME: home, TMPDIR: '/tmp', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  processes.push(child);
  let sequence = 0;
  const pending = new Map();
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4096);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (request && message.type === 'response') {
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.success) request.resolve(message.data);
        else request.reject(new Error(JSON.stringify(message)));
      }
    } catch (error) {
      for (const request of pending.values()) request.reject(error);
    }
  });
  child.on('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('RPC exited: ' + stderr));
    }
    pending.clear();
    lines.close();
  });
  return {
    async request(type, params = {}) {
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('RPC request timed out: ' + type + ' ' + stderr));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, type, ...params }) + '\n');
      });
    },
    async close() {
      if (child.exitCode !== null) return;
      const exit = once(child, 'close');
      child.stdin.end();
      await exit;
    },
  };
}

try {
  if (process.argv.includes('--seed')) {
    const manager = SessionManager.create('/workspace', '/tmp/fixture-sessions');
    manager.appendSessionInfo('orvilo-nonempty-fixture');
    const usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const assistant = (content) => ({
      role: 'assistant',
      content,
      api: 'openai-completions',
      provider: 'openai',
      model: 'fixture-no-inference',
      usage,
      stopReason: 'toolUse',
      timestamp: 1,
    });
    manager.appendMessage({
      role: 'user',
      content: 'Preserve fixture history without executing tools.',
      timestamp: 1,
    });
    manager.appendMessage(
      assistant([
        {
          type: 'toolCall',
          id: 'completed-fixture-call',
          name: 'repl',
          arguments: { code: 'print("historical fixture")' },
        },
      ]),
    );
    manager.appendMessage({
      role: 'toolResult',
      toolCallId: 'completed-fixture-call',
      toolName: 'repl',
      content: [{ type: 'text', text: 'historical fixture result' }],
      isError: false,
      timestamp: 2,
    });
    manager.appendMessage(
      assistant([
        {
          type: 'toolCall',
          id: 'pending-fixture-call',
          name: 'repl',
          arguments: { code: 'open("/tmp/should-not-run", "w").write("bad")' },
        },
      ]),
    );
    manager.flushNow();
    const bytes = await readFile(manager.getSessionFile());
    console.log(
      JSON.stringify({
        phase: 'nonempty-snapshot',
        sessionId: manager.getSessionId(),
        snapshot: bytes.toString('base64'),
        setup: 'official SessionManager fixture, not inference',
      }),
    );
  } else {
    const bytes = await readFile('/workspace/session.jsonl');
    const entries = bytes
      .toString()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const expectedId = entries[0].id;
    await mkdir('/tmp/sessions', { recursive: true });
    await writeFile('/tmp/sessions/restored.jsonl', bytes);
    const rpc = start([
      '--daemon-socket',
      '/tmp/nonempty.sock',
      '--resume',
      '/tmp/sessions/restored.jsonl',
    ]);
    const state = await rpc.request('get_state');
    const history = await rpc.request('get_messages');
    assert.equal(state.sessionId, expectedId);
    assert.equal(state.sessionName, 'orvilo-nonempty-fixture');
    assert.equal(state.isStreaming, false);
    assert.ok(
      history.messages.some(
        (m) =>
          m.role === 'user' && m.content === 'Preserve fixture history without executing tools.',
      ),
    );
    assert.ok(
      history.messages.some(
        (m) =>
          m.role === 'toolResult' &&
          m.toolCallId === 'completed-fixture-call' &&
          m.content.some((c) => c.text === 'historical fixture result'),
      ),
    );
    const pending = history.messages
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => m.content)
      .filter((c) => c.type === 'toolCall' && c.id === 'pending-fixture-call');
    assert.equal(pending.length, 1);
    await assert.rejects(access('/tmp/should-not-run'), { code: 'ENOENT' });
    console.log(
      JSON.stringify({
        phase: 'nonempty-restored',
        sessionId: state.sessionId,
        messageCount: state.messageCount,
        roles: history.messages.map((m) => m.role),
        pendingHistoricalCalls: pending.length,
        streaming: state.isStreaming,
        sentinelAbsent: true,
        providerCalls: 0,
        caveat: 'historical fixture preserved, no inference or pending effect resumed',
      }),
    );
    await rpc.close();
  }
} catch (error) {
  console.log(JSON.stringify({ failed: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill('SIGKILL');
}
