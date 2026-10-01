// @vitest-environment node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it } from 'vitest';

import { PrimeStdioTransport } from './primeStdioTransport';

// Inert fixture: actual wire IO, not Prime execution or OS isolation evidence.
it('exchanges subprocess NDJSON and denies reverse filesystem permission', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
    let requestId;
    require('node:readline').createInterface({input:process.stdin}).on('line', line => {
      const m=JSON.parse(line);
      if(m.method) {requestId=m.id; send({jsonrpc:'2.0',id:'reverse',method:'fs/write_text_file',params:{path:'/private'}});}
      else send({jsonrpc:'2.0',id:requestId,result:{denied:m.error.code===-32601}});
    });
  `,
    ],
    // Ambient app ProcessEnv types do not apply to a credential-free child.
    { env: {} as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'ignore'] },
  );
  const exit = once(child, 'close');
  const transport = new PrimeStdioTransport({ stdin: child.stdin!, stdout: child.stdout! });
  try {
    expect(await transport.request('initialize', {})).toEqual({ denied: true });
  } finally {
    transport.close();
    child.kill();
    await exit;
  }
});
it.each(['{"jsonrpc":"2.0",', 'x'.repeat(129)])(
  'rejects malformed/oversized frame',
  async (body) => {
    const stdout = new PassThrough();
    const transport = new PrimeStdioTransport({ stdin: new PassThrough(), stdout }, 1000, 128);
    const rejection = expect(transport.request('initialize', {})).rejects.toThrow('unavailable');
    stdout.write(body + '\n');
    await rejection;
  },
);
it('settles on EOF and strips provider error text', async () => {
  const stdout = new PassThrough();
  const transport = new PrimeStdioTransport({ stdin: new PassThrough(), stdout });
  const first = expect(transport.request('initialize', {})).rejects.toThrow('ACP request failed');
  const second = expect(transport.request('session/new', {})).rejects.toThrow(
    'ACP transport unavailable',
  );
  stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'secret-value' } }) + '\n',
  );
  await first;
  stdout.end();
  await second;
});
it('closes pending work after timeout', async () => {
  const transport = new PrimeStdioTransport(
    { stdin: new PassThrough(), stdout: new PassThrough() },
    10,
  );
  await expect(transport.request('initialize', {})).rejects.toThrow('unavailable');
  await expect(transport.request('session/new', {})).rejects.toThrow('closed');
});
