import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  admit,
  candidateSha,
  qaRef,
  toolingPaths,
  verifySource,
} from '../../docker-compose/qa-permission/admit.mjs';

const qaDirectory = path.resolve(import.meta.dirname, '../../docker-compose/qa-permission');

const valid = {
  ref: qaRef,
  workflowSha: 'a'.repeat(40),
  candidate: candidateSha,
  image: `ghcr.io/alexj11324/orvilo1@sha256:${'b'.repeat(64)}`,
  build: 'false',
  deploy: 'false',
  retag: '',
  changedPaths: toolingPaths,
};

test('admits only fixed QA source/digest identity and emits a nonsecret receipt', () => {
  assert.deepEqual(admit(valid), {
    candidateSha,
    workflowSha: valid.workflowSha,
    image: valid.image,
    target: 'qa-permission-20261008',
  });
});

test('rejects protected refs, command injection, floating/foreign images and wrong candidate', () => {
  for (const ref of ['refs/heads/canary', 'refs/heads/main', `${qaRef}; rm -rf /`])
    assert.throws(() => admit({ ...valid, ref }));
  for (const image of [
    'ghcr.io/alexj11324/orvilo1:canary',
    valid.image + ';id',
    valid.image.replace('orvilo1', 'other'),
  ])
    assert.throws(() => admit({ ...valid, image }));
  assert.throws(() => admit({ ...valid, candidate: 'c'.repeat(40) }));
  assert.throws(() => admit({ ...valid, workflowSha: candidateSha }));
});

test('rejects every production effect and any business or unknown tooling delta', () => {
  for (const key of ['build', 'deploy']) assert.throws(() => admit({ ...valid, [key]: 'true' }));
  assert.throws(() => admit({ ...valid, retag: candidateSha }));
  for (const file of [
    'apps/server/src/services/auth/clerk.ts',
    'packages/database/src/schema.ts',
    'src/app.tsx',
    'docker-compose/deploy/docker-compose.yml',
    'docker-compose/qa-permission/extra.sh',
  ])
    assert.throws(() => admit({ ...valid, changedPaths: [file] }));
});

test('source verification rejects a claimed SHA that is not the actual checkout', async () => {
  await assert.rejects(verifySource('0'.repeat(40)), /Checkout differs/);
});

test('activation dry-run rejects prod paths and malformed identities before any host operation', async () => {
  const run = promisify(execFile);
  const script = path.join(qaDirectory, 'activate.sh');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-qa-guard-'));
  try {
    for (const args of [
      [
        'dry-run',
        '/var/lib/orvilo1/docker-compose/deploy',
        candidateSha,
        valid.workflowSha,
        valid.image,
      ],
      ['dry-run', directory, 'canary', valid.workflowSha, valid.image],
      ['dry-run', directory, candidateSha, valid.workflowSha, 'orvilo:canary'],
    ])
      await assert.rejects(run('bash', [script, ...args]));
    const { stdout } = await run('bash', [
      script,
      'dry-run',
      '/var/lib/orvilo1-qa-permission-20261008',
      candidateSha,
      valid.workflowSha,
      valid.image,
    ]);
    assert.match(stdout, /QA admission passed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fresh secret preparation uses restricted files, host-only auth and isolated service endpoints', async () => {
  const run = promisify(execFile);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-qa-env-test-'));
  const output = path.join(directory, 'qa-env-test');
  try {
    await run(process.execPath, [path.join(qaDirectory, 'prepare-env.mjs'), output], {
      env: {
        ...process.env,
        RUNNER_TEMP: directory,
        CLERK_SECRET_KEY: 'fixture_credential_never_used_for_network_auth',
        QA_IMAGE_REF: valid.image,
        QA_GATEWAY_IMAGE_REF: valid.image,
      },
    });
    assert.equal((await stat(output)).mode & 0o777, 0o700);
    for (const file of await readdir(output))
      assert.equal((await stat(path.join(output, file))).mode & 0o777, 0o600);
    const env = Object.fromEntries(
      (await readFile(path.join(output, 'app.env'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    assert.equal(env.AUTH_COOKIE_DOMAIN, undefined);
    assert.equal(env.AUTH_ACCOUNTS_URL, 'https://accounts-qa-permission.aspectlylabs.com');
    assert.equal(env.DATABASE_URL.split('@')[1], 'postgres:5432/qa_permission');
    assert.equal(env.SMTP_HOST, 'mailpit');
    assert.equal(env.SMTP_SECURE, 'false');
    assert.match(env.SMTP_PASS, /^[a-f0-9]{64}$/);
    assert.equal(env.HATCHET_CLIENT_TOKEN, undefined);
    assert.equal(Buffer.from(env.KEY_VAULTS_SECRET, 'base64').length, 32);
    assert.ok(JSON.parse(env.JWKS_KEY).keys[0].d);
    assert.equal(
      JSON.parse(await readFile(path.join(output, 'jwks.public.json'), 'utf8')).keys[0].d,
      undefined,
    );
    assert.equal(
      env.DEVICE_GATEWAY_URL,
      'https://qa-permission.aspectlylabs.com/_qa/device-gateway',
    );
    await assert.rejects(
      run(process.execPath, [path.join(qaDirectory, 'prepare-env.mjs'), output], {
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          CLERK_SECRET_KEY: 'fixture',
          QA_IMAGE_REF: valid.image,
          QA_GATEWAY_IMAGE_REF: valid.image,
        },
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('parsed QA Compose has only QA resource names and loopback public service ports', async () => {
  const run = promisify(execFile);
  const { stdout } = await run('python3', [
    '-c',
    'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))',
    path.join(qaDirectory, 'docker-compose.yml'),
  ]);
  const config = JSON.parse(stdout);
  assert.equal(config.name, 'orvilo-qa-permission-20261008');
  for (const [name, service] of Object.entries(config.services)) {
    assert.equal(service.container_name, `orvilo-qa-permission-${name}`);
    for (const port of service.ports || []) assert.match(port, /^127\.0\.0\.1:132\d\d:\d+$/);
    assert.equal(service.build, undefined);
    assert.equal(service.privileged, undefined);
    for (const volume of service.volumes || [])
      assert.match(volume, /^qa-[a-z-]+:\/(?:data|config|var\/lib\/postgresql\/data)$/);
    if (service.env_file)
      assert.match(service.env_file, /^\/run\/orvilo-qa-permission\/[a-z-]+\.env$/);
  }
  assert.equal(config.services.mailpit.ports[0], '127.0.0.1:13250:8025');
  assert.equal(config.services.mailpit.environment.MP_SMTP_AUTH_ACCEPT_ANY, undefined);
  assert.match(
    config.services.mailpit.environment.MP_SMTP_ALLOWED_RECIPIENTS,
    /owner\|admin\|member\|viewer\|nouse\|foreign/,
  );
  assert.equal(config.services.hatchet.environment.SERVER_GRPC_BROADCAST_ADDRESS, 'hatchet:7077');
  assert.ok(config.services.app.image.includes('QA_IMAGE_REF'));
});

test('workflow QA excludes every original production job and retains original non-QA behavior', async () => {
  const run = promisify(execFile);
  const code = String.raw`
import re, subprocess, sys, types, yaml
workflow = yaml.safe_load(open(sys.argv[1]))
base = yaml.safe_load(subprocess.check_output(['git', 'show', '${candidateSha}:.github/workflows/deploy-orvilo1.yml']))
def evaluate(expression, event, qa, build, deploy, retag, result, diagnose=False, ref='refs/heads/codex/permission-qa-current'):
    expression = expression.replace('&&', ' and ').replace('||', ' or ')
    expression = re.sub(r'!(?!=)', 'not ', expression)
    context = dict(github=types.SimpleNamespace(event_name=event, ref=ref), inputs=types.SimpleNamespace(qa_permission=qa, qa_diagnose=diagnose, build=build, deploy=deploy, retag_main_from=retag), needs=types.SimpleNamespace(build=types.SimpleNamespace(result=result)), always=lambda: True)
    return bool(eval(expression, {'__builtins__': {}}, context))
for name in ['build', 'promote', 'retag-main', 'deploy']:
    for build in [False, True]:
        for deploy in [False, True]:
            for retag in ['', 'a' * 40]:
                assert not evaluate(workflow['jobs'][name]['if'], 'workflow_dispatch', True, build, deploy, retag, 'success'), name
                for qa in [False, True]:
                    assert not evaluate(workflow['jobs'][name]['if'], 'workflow_dispatch', qa, build, deploy, retag, 'success', True), name
                for event in ['push', 'workflow_dispatch']:
                    for result in ['success', 'skipped', 'failure']:
                        args = (event, False, build, deploy, retag, result)
                        assert evaluate(workflow['jobs'][name]['if'], *args) == evaluate(base['jobs'][name]['if'], *args), name
for qa in [False, True]:
    for diagnose in [False, True]:
        args = ('workflow_dispatch', qa, False, False, '', 'success', diagnose)
        assert evaluate(workflow['jobs']['qa-diagnose']['if'], *args) == (qa and diagnose)
        for name in ['qa-gateways', 'qa-deploy']:
            assert evaluate(workflow['jobs'][name]['if'], *args) == (qa and not diagnose), name
for ref in ['refs/heads/canary', 'refs/heads/main']:
    assert not evaluate(workflow['jobs']['qa-diagnose']['if'], 'workflow_dispatch', True, False, False, '', 'success', True, ref)
assert workflow[True]['workflow_dispatch']['inputs']['qa_diagnose']['default'] is False
print('QA exclusion and original production admission verified')
`;
  const { stdout } = await run('python3', [
    '-c',
    code,
    path.resolve(import.meta.dirname, '../../.github/workflows/deploy-orvilo1.yml'),
  ]);
  assert.match(stdout, /admission verified/);
});

test('network-only collision rejects at the actual Docker metadata boundary before pull/up/removal', async () => {
  const run = promisify(execFile);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-qa-network-guard-'));
  const log = path.join(directory, 'commands.log');
  try {
    const source = await readFile(path.join(qaDirectory, 'activate.sh'), 'utf8');
    const declarations = source.slice(
      source.indexOf('names=('),
      source.indexOf('[[ ! -e "$directory/activation-receipt.json"'),
    );
    const metadataBoundary = source.slice(
      source.indexOf('for name in "${names[@]}"'),
      source.indexOf('[[ -z "$(ss'),
    );
    await writeFile(
      path.join(directory, 'docker'),
      `#!/bin/bash\nprintf '%s\\n' "$*" >> "$QA_COMMAND_LOG"\nif [[ "$*" == 'network inspect orvilo-qa-permission-20261008' ]]; then exit 0; fi\nif [[ "$2" == inspect ]]; then exit 1; fi\nexit 0\n`,
      { mode: 0o700 },
    );
    const script = `set -euo pipefail\n${declarations}\n${metadataBoundary}\ndocker compose pull\ndocker compose up -d\ndocker network rm orvilo-qa-permission-20261008\n`;
    await assert.rejects(
      run('/bin/bash', ['-c', script], {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, QA_COMMAND_LOG: log },
      }),
      /QA network already exists/,
    );
    const commands = (await readFile(log, 'utf8')).trim().split('\n');
    assert.equal(commands.at(-1), 'network inspect orvilo-qa-permission-20261008');
    assert.ok(commands.every((command) => /^(?:container|volume|network) inspect /.test(command)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('advertised collaboration endpoint maps directly to the maintained upgrade path and retains query', async () => {
  const source = await readFile(path.join(qaDirectory, 'prepare-env.mjs'), 'utf8');
  const publicUrl = source.match(/COLLABORATION_GATEWAY_PUBLIC_URL:\s*'([^']+)'/)[1];
  const request = new URL(publicUrl);
  request.searchParams.set('room', 'task:qa-room');
  request.searchParams.set('token', 'opaque-qa-ticket');
  const config = await readFile(path.join(qaDirectory, 'nginx.conf'), 'utf8');
  const exactRouteLine = config.split('\n').find((line) => line.trim().startsWith('location = '));
  const exactRoute = exactRouteLine?.match(/^\s*location = (\S+) \{ proxy_pass (\S+); \}$/);
  assert.ok(exactRoute, 'The advertised endpoint requires an exact proxy mapping');
  assert.equal(exactRoute[1], request.pathname);
  const upstream = new URL(exactRoute[2]);
  upstream.search = request.search;
  const gateway = await readFile(
    path.resolve(qaDirectory, '../../apps/collaboration-gateway/src/server.ts'),
    'utf8',
  );
  assert.equal(upstream.pathname, gateway.match(/const WS_PATH = '([^']+)'/)[1]);
  assert.equal(upstream.host, '127.0.0.1:13212');
  assert.equal(upstream.searchParams.get('room'), 'task:qa-room');
  assert.equal(upstream.searchParams.get('token'), 'opaque-qa-ticket');
});

test('both run-owned remote cleanup commands work in zsh with absent files and preserve foreign ownership', async () => {
  const run = promisify(execFile);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-qa-cleanup-'));
  try {
    await writeFile(path.join(directory, 'sudo'), '#!/bin/bash\nexec "$@"\n', { mode: 0o700 });
    await writeFile(path.join(directory, 'ssh'), '#!/bin/bash\nexec zsh -c "${!#}"\n', {
      mode: 0o700,
    });
    const sources = [
      await readFile(path.join(qaDirectory, 'qa-ci.sh'), 'utf8'),
      await readFile(
        path.resolve(qaDirectory, '../../.github/workflows/deploy-orvilo1.yml'),
        'utf8',
      ),
    ];
    for (const source of sources) {
      const command = source
        .split('\n')
        .find((line) => line.includes('"if test') && line.includes('owner.id'));
      assert.ok(command);
      const sandbox = command
        .trim()
        .replace(/ \|\| status=1$/, '')
        .replaceAll('/run/orvilo-qa-permission', directory);
      await writeFile(path.join(directory, 'owner.id'), '37769202201-1\n');
      await run(
        'bash',
        ['-c', `GITHUB_RUN_ID=37769202201 GITHUB_RUN_ATTEMPT=1\nssh ignored ${sandbox}`],
        {
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      await writeFile(path.join(directory, 'app.env'), 'fixture');
      await writeFile(path.join(directory, 'owner.id'), 'different-owner\n');
      await run(
        'bash',
        ['-c', `GITHUB_RUN_ID=37769202201 GITHUB_RUN_ATTEMPT=1\nssh ignored ${sandbox}`],
        {
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      assert.equal(await readFile(path.join(directory, 'app.env'), 'utf8'), 'fixture');
      await rm(path.join(directory, 'app.env'));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('actual DNS diagnostic executes only fixed GETs, emits safe metadata and rejects foreign identity/origin', async () => {
  const run = promisify(execFile);
  const { stdout } = await run('python3', [
    '-c',
    'import json,sys,yaml; w=yaml.safe_load(open(sys.argv[1])); print(json.dumps(next(s["run"] for s in w["jobs"]["qa-diagnose"]["steps"] if s.get("name") == "Read only exact QA DNS metadata")))',
    path.resolve(import.meta.dirname, '../../.github/workflows/deploy-orvilo1.yml'),
  ]);
  const script = JSON.parse(stdout).split("<<'NODE'\n")[1].split('\nNODE')[0];
  assert.ok(script);
  for (const variant of [
    'valid',
    'accounts-zero',
    'foreign-zone',
    'foreign-account',
    'foreign-origin',
    'dns-403',
  ]) {
    const fake = String.raw`
import assert from 'node:assert/strict';
const variant = ${JSON.stringify(variant)};
const fixtureZone = 'c71d288fdeb11a7ebf3c179d8a4961c8';
const fixtureAccount = 'd8f6630c7869111a5139bc5ed4d24ace';
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(url.origin, 'https://api.cloudflare.com');
  assert.equal(options.method, 'GET');
  assert.equal(options.headers.Authorization, 'Bearer fixture_dns_secret_never_used_for_network');
  let status = 200;
  let result;
  if (url.pathname === '/client/v4/zones/' + fixtureZone) {
    result = { id: variant === 'foreign-zone' ? 'foreign' : fixtureZone, name: 'aspectlylabs.com', account: { id: variant === 'foreign-account' ? 'foreign' : fixtureAccount } };
  } else {
    assert.equal(url.pathname, '/client/v4/zones/' + fixtureZone + '/dns_records');
    const name = url.searchParams.get('name');
    assert.ok(['qa-permission.aspectlylabs.com', 'accounts-qa-permission.aspectlylabs.com'].includes(name));
    status = variant === 'dns-403' ? 403 : 200;
    result = variant === 'accounts-zero' && name.startsWith('accounts-') ? [] : [{ id: name.startsWith('accounts-') ? 'account-record' : 'app-record', name, type: 'A', content: variant === 'foreign-origin' ? '198.51.100.8' : '192.0.2.7', proxied: true, created_on: '2026-10-08T11:31:00Z', modified_on: '2026-10-08T11:31:00Z' }];
  }
  return { ok: status === 200, status, json: async () => ({ success: status === 200, result, errors: status === 403 ? [{ code: 10000 }] : [] }) };
};
`;
    const result = await run(process.execPath, ['--input-type=module', '-e', fake + script], {
      env: {
        ...process.env,
        CLOUDFLARE_DNS_API_TOKEN: 'fixture_dns_secret_never_used_for_network',
        SSH_HOST: '192.0.2.7',
      },
    }).catch((error) => error);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.readOnly, true);
    assert.ok(
      !result.stdout.includes('fixture_dns_secret') &&
        !result.stdout.includes('192.0.2.7') &&
        !result.stdout.includes('198.51.100.8'),
    );
    if (['valid', 'accounts-zero'].includes(variant)) {
      assert.equal(result.code, undefined);
      assert.equal(receipt.records[0].id, 'app-record');
      assert.equal(receipt.records[0].matches_known_qa_origin, true);
      assert.equal(receipt.lookups[2].record_count, variant === 'accounts-zero' ? 0 : 1);
    } else {
      assert.equal(result.code, 1);
      if (variant === 'dns-403') {
        assert.deepEqual(
          receipt.lookups.slice(1).map((lookup) => [lookup.http_status, lookup.record_count]),
          [
            [403, null],
            [403, null],
          ],
        );
      } else {
        assert.equal(
          receipt.admissionError,
          variant === 'foreign-origin' ? 'QA_ORIGIN' : 'QA_ZONE_ACCOUNT',
        );
      }
    }
  }
});
