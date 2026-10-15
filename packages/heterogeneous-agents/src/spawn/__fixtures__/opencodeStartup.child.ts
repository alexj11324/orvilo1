import { appendFile, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const [mode, directory, id, agentType, scenario] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = async (file: string) =>
  readFile(file).then(
    () => true,
    () => false,
  );
const record = (event: string) =>
  appendFile(
    path.join(directory, 'events.jsonl'),
    `${JSON.stringify({ event, id, pid: process.pid })}\n`,
  );

if (mode === 'native') {
  // Emulate the observed native WAL setup: a live startup owner must not overlap.
  const marker = path.join(directory, 'native-startup');
  try {
    const handle = await open(marker, 'wx');
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch {
    const owner = Number(await readFile(marker, 'utf8'));
    let alive = true;
    try {
      process.kill(owner, 0);
    } catch {
      alive = false;
    }
    if (alive) await record('startup-overlap');
  }
  await record('startup');
  await writeFile(path.join(directory, `native-${id}`), String(process.pid));
  if (['failure', 'active-cancel'].includes(scenario) && id === 'first')
    process.on('SIGTERM', () => {});
  createInterface({ input: process.stdin }).on('line', async (line) => {
    const request = JSON.parse(line);
    const respond = (result: unknown) =>
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
    if (request.method === 'initialize') {
      if (scenario === 'active-cancel' && id === 'first') {
        await writeFile(path.join(directory, 'initializing-first'), '');
        return;
      }
      await sleep(500);
      if (scenario === 'failure' && id === 'first') {
        respond({ protocolVersion: 99 });
        return;
      }
      if ((await readFile(marker, 'utf8').catch(() => '')) === String(process.pid))
        await rm(marker);
      respond({ protocolVersion: 1 });
    } else if (request.method === 'session/new') {
      respond({ sessionId: `fake-${id}` });
    } else if (request.method === 'session/prompt') {
      await record('prompt');
      await writeFile(path.join(directory, `prompt-${id}`), '');
      if (scenario === 'parallel') {
        while (
          !(await exists(path.join(directory, 'prompt-first'))) ||
          !(await exists(path.join(directory, 'prompt-second')))
        )
          await sleep(10);
      }
      respond({ stopReason: 'end_turn' });
    }
  });
} else {
  const { createStandardAcpSession } = await import('../standardAcpAgents');
  await writeFile(path.join(directory, `ready-${id}`), '');
  if (scenario === 'parallel') {
    while (
      !(await exists(path.join(directory, 'ready-first'))) ||
      !(await exists(path.join(directory, 'ready-second')))
    )
      await sleep(10);
  }
  const session = createStandardAcpSession(agentType, {
    args: [],
    cacheKeepalive: { enabled: false },
    clientVersion: 'test',
    commandArgs: [import.meta.filename, 'native', directory, id, agentType, scenario],
    commandPath: process.execPath,
    cwd: directory,
    env: process.env,
    onEvents: () => {},
    onRawMessage: () => {},
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: () => {},
    operationId: id,
    prompt: 'test',
    requestTimeoutMs: 5000,
    sessionId: id,
  });
  const run = session.run();
  if (scenario === 'active-cancel' && id === 'first') {
    while (!(await exists(path.join(directory, 'initializing-first')))) await sleep(10);
    session.close();
  }
  try {
    await run;
    await record('completed');
  } catch {
    await record('failed');
  } finally {
    session.close('SIGKILL');
  }
}
