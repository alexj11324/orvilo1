/** Runs inside the restricted pinned image only. Never sends a prompt or effect command. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

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
  const first = start();
  await first.request('get_state');
  await first.request('set_session_name', { name: 'orvilo-resume-no-inference' });
  const saved = await first.request('get_state');
  assert.equal(saved.sessionName, 'orvilo-resume-no-inference');
  assert.ok(saved.sessionFile?.startsWith('/tmp/'));
  await access(saved.sessionFile);
  const bytesBefore = await readFile(saved.sessionFile, 'utf8');
  console.log(
    JSON.stringify({
      phase: 'saved',
      sessionId: saved.sessionId,
      sessionFile: saved.sessionFile,
      bytes: Buffer.byteLength(bytesBefore),
      messageCount: saved.messageCount,
    }),
  );
  await first.request('new_session');
  const fresh = await first.request('get_state');
  assert.notEqual(fresh.sessionId, saved.sessionId);
  const switched = await first.request('switch_session', { sessionPath: saved.sessionFile });
  assert.equal(switched.cancelled, false);
  const restored = await first.request('get_state');
  assert.equal(restored.sessionId, saved.sessionId);
  assert.equal(restored.sessionName, saved.sessionName);
  console.log(
    JSON.stringify({ phase: 'rpc-switch', restored: true, sessionId: restored.sessionId }),
  );
  await first.close();
  if (!process.argv.includes('--cold-only')) {
    const second = start(['--resume', saved.sessionFile]);
    const resumed = await second.request('get_state');
    assert.equal(resumed.sessionId, saved.sessionId);
    assert.equal(resumed.sessionName, saved.sessionName);
    console.log(
      JSON.stringify({
        phase: 'cli-resume',
        restored: true,
        sessionId: resumed.sessionId,
        caveat: 'RPC client restart; daemon may remain alive',
        providerCalls: 0,
      }),
    );
    await second.close();
  }
  await mkdir('/tmp/cold', { recursive: true });
  await writeFile('/tmp/cold/recovered.jsonl', bytesBefore);
  const cold = start(
    ['--daemon-socket', '/tmp/cold/daemon.sock', '--resume', '/tmp/cold/recovered.jsonl'],
    '/tmp/cold',
  );
  const rehydrated = await cold.request('get_state');
  assert.equal(rehydrated.sessionId, saved.sessionId);
  assert.equal(rehydrated.sessionName, saved.sessionName);
  assert.equal(rehydrated.sessionFile, '/tmp/cold/recovered.jsonl');
  console.log(
    JSON.stringify({
      phase: 'independent-daemon-file-resume',
      restored: true,
      sessionId: rehydrated.sessionId,
      sessionFile: rehydrated.sessionFile,
      messageCount: rehydrated.messageCount,
      caveat: 'new HOME and copied named empty-session file; source daemon not killed',
      providerCalls: 0,
    }),
  );
  await cold.close();
} catch (error) {
  console.log(JSON.stringify({ failed: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill('SIGKILL');
}
