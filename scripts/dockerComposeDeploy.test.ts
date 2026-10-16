import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const deployDirectory = path.resolve(import.meta.dirname, '../docker-compose/deploy');
const compose = parse(readFileSync(path.join(deployDirectory, 'docker-compose.yml'), 'utf8')) as {
  services: Record<
    string,
    {
      build?: { args?: Record<string, string>; context?: string; dockerfile?: string };
      command?: string[];
      depends_on?: Record<string, { condition: string }>;
      entrypoint?: string[];
      environment?: string[];
      healthcheck?: { test: string[] };
      image: string;
      ports?: string[];
      profiles?: string[];
      restart?: string;
      stop_grace_period?: string;
      volumes?: string[];
    }
  >;
  volumes: Record<string, unknown>;
};
const dockerfile = readFileSync(path.resolve(import.meta.dirname, '../Dockerfile'), 'utf8');
const runtimeDeps = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../docker/runtime-deps/package.json'), 'utf8'),
) as { dependencies: Record<string, string> };
const runtimeDepsWorkspace = readFileSync(
  path.resolve(import.meta.dirname, '../docker/runtime-deps/pnpm-workspace.yaml'),
  'utf8',
);
const deployWorkflow = readFileSync(
  path.resolve(import.meta.dirname, '../.github/workflows/deploy-orvilo1.yml'),
  'utf8',
);
const elasticsearchDockerfile = readFileSync(
  path.join(deployDirectory, 'elasticsearch/Dockerfile'),
  'utf8',
);
const setupScript = readFileSync(path.join(deployDirectory, '../setup.sh'), 'utf8');
const envExamples = ['.env.example', '.env.zh-CN.example'].map((file) =>
  readFileSync(path.join(deployDirectory, file), 'utf8'),
);

const ELASTICSEARCH_PROFILES = ['elasticsearch', 'elasticsearch-reindex', 'elasticsearch-sync'];

describe('deploy docker-compose optional Elasticsearch', () => {
  const {
    elasticsearch,
    'fts-search-reindex': reindex,
    'fts-search-sync': sync,
  } = compose.services;

  it('keeps every Elasticsearch service behind an opt-in profile so the default deployment is unchanged', () => {
    const profiled = Object.entries(compose.services).filter(([, service]) =>
      service.profiles?.some((profile) => ELASTICSEARCH_PROFILES.includes(profile)),
    );
    expect(profiled.map(([name]) => name).sort()).toEqual([
      'elasticsearch',
      'fts-search-reindex',
      'fts-search-sync',
    ]);
    for (const [, service] of profiled) {
      expect(service.profiles!.every((profile) => ELASTICSEARCH_PROFILES.includes(profile))).toBe(
        true,
      );
    }
    expect(compose.services.orvilo.depends_on).not.toHaveProperty('elasticsearch');
  });

  it('keeps the backfill and sync services usable against an external Elasticsearch', () => {
    // Only the `elasticsearch` profile starts the bundled node. `docker compose run` starts
    // dependencies, so a `depends_on: elasticsearch` here would build and start the local node
    // even when .env points at an external Elastic Cloud target.
    expect(elasticsearch.profiles).toEqual(['elasticsearch']);
    for (const service of [reindex, sync]) {
      expect(service.depends_on).not.toHaveProperty('elasticsearch');
      expect(service.depends_on?.postgresql.condition).toBe('service_healthy');
    }
  });

  it('builds a pinned local image on the official Elasticsearch base with ICU, persistence, and a health check', () => {
    // A checked-in Dockerfile keeps the Compose file parseable by older Compose releases;
    // `dockerfile_inline` would be rejected at parse time even with the profile disabled.
    expect(elasticsearch.build).toEqual({
      args: { ELASTICSEARCH_VERSION: expect.stringMatching(/^\d+\.\d+\.\d+$/) },
      context: './elasticsearch',
    });
    const version = elasticsearch.build!.args!.ELASTICSEARCH_VERSION;
    // The local tag carries the same version so bumping it triggers a rebuild on `up`.
    expect(elasticsearch.image).toBe(`orvilo-elasticsearch-icu:${version}`);
    expect(elasticsearchDockerfile).toContain(
      'FROM docker.elastic.co/elasticsearch/elasticsearch:${ELASTICSEARCH_VERSION}',
    );
    expect(elasticsearchDockerfile).toContain(
      'RUN bin/elasticsearch-plugin install --batch analysis-icu',
    );
    // The one-click installer must download the build context next to the Compose file.
    expect(setupScript).toContain('"$SUB_DIR/elasticsearch/Dockerfile"');
    expect(setupScript).toContain('"elasticsearch/Dockerfile"');
    // No runtime plugin install: the entrypoint of the official image stays untouched.
    expect(elasticsearch.command).toBeUndefined();
    expect(elasticsearch.entrypoint).toBeUndefined();
    expect(elasticsearch.environment).toContain('discovery.type=single-node');
    expect(elasticsearch.environment).toContain('xpack.security.enabled=false');
    expect(elasticsearch.environment?.some((entry) => entry.startsWith('ES_JAVA_OPTS='))).toBe(
      true,
    );
    expect(elasticsearch.volumes).toContain('elasticsearch-data:/usr/share/elasticsearch/data');
    expect(compose.volumes).toHaveProperty('elasticsearch-data');
    expect(elasticsearch.healthcheck?.test.join(' ')).toContain('/_cluster/health');
  });

  it('never publishes the unauthenticated Elasticsearch port to the host', () => {
    expect(elasticsearch.ports).toBeUndefined();
    expect(reindex.ports).toBeUndefined();
    expect(sync.ports).toBeUndefined();
  });

  it('runs backfill and continuous sync from the image built in this repository', () => {
    // This repo ships its own deploy stack, so the backfill and the sync worker are built from the
    // root Dockerfile instead of pulling the upstream Orvilo release. They must run the very same
    // tag as the app service, or the bundles could drift from the server that wrote the Outbox.
    expect(compose.services.orvilo.image).toBe('${ORVILO_IMAGE_TAG:-orvilo:local}');
    for (const service of [reindex, sync]) {
      expect(service.image).toBe(compose.services.orvilo.image);
      expect(service.build).toEqual({ context: '../..', dockerfile: 'Dockerfile' });
    }

    expect(reindex.restart).toBe('no');
    // The image ENTRYPOINT is `/bin/node`, and `docker compose run <service> <args>` replaces the
    // whole command, so the script must live in the entrypoint for `run ... --apply` to work.
    expect(reindex.entrypoint).toEqual(['/bin/node', '/app/fts-search-elasticsearch-reindex.cjs']);
    expect(reindex.command).toEqual(['--status']);
    expect(reindex.environment).toContain('ES_REINDEX_STATE_DIR=/app/.elasticsearch-reindex');
    expect(reindex.volumes).toContain('fts-search-reindex-state:/app/.elasticsearch-reindex');
    expect(compose.services.orvilo.volumes).toContain(
      'fts-search-reindex-state:/app/.elasticsearch-reindex',
    );
    expect(compose.volumes).toHaveProperty('fts-search-reindex-state');
    // The image pre-creates the checkpoint mountpoint so the named volume inherits nextjs ownership.
    expect(dockerfile).toContain('mkdir -p /app/.elasticsearch-reindex');
    expect(compose.services.orvilo.environment).toContain(
      'ES_REINDEX_STATE_DIR=/app/.elasticsearch-reindex',
    );

    expect(sync.restart).toBe('always');
    expect(sync.entrypoint).toEqual(['/bin/node', '/app/fts-search-elasticsearch-sync.cjs']);
    expect(sync.command).toEqual([
      '--max-steps=8',
      '--interval-seconds=${FTS_SEARCH_SYNC_INTERVAL_SECONDS:-15}',
      '--yes',
    ]);
    expect(sync.environment).toContain('FTS_SEARCH_SYNC_ENABLED=true');
    expect(sync.environment).toContain('MIGRATION_DB=1');
    // Compose's default 10s grace period would SIGKILL a drain step in flight.
    expect(sync.stop_grace_period).toBe('2m');
    // The sync bundle keeps drizzle-orm external, and drizzle-orm/neon-serverless requires
    // @neondatabase/serverless at load time even though DATABASE_DRIVER=node never uses it, so the
    // image must ship that package next to pg and drizzle-orm or the container crash-loops.
    // Versions and native build scripts live in the frozen supplemental project, not an unpinned add.
    expect(dockerfile).toContain('COPY docker/runtime-deps /deps');
    expect(dockerfile).toContain('pnpm --dir /deps install --frozen-lockfile --prod');
    expect(dockerfile).not.toContain('pnpm add ');
    expect(runtimeDeps.dependencies).toEqual({
      '@copilotkit/channels-core': '0.11.0',
      '@grpc/grpc-js': '1.14.4',
      '@hatchet-dev/typescript-sdk': '1.33.1',
      '@neondatabase/serverless': '^1.1.0',
      'drizzle-orm': '^0.45.2',
      pg: '^8.23.0',
      sharp: '0.34.5',
    });
    expect(runtimeDepsWorkspace).toContain('sharp: true');
    expect(runtimeDepsWorkspace).toContain("'@hatchet-dev/typescript-sdk': true");
    expect(runtimeDepsWorkspace).toContain('protobufjs: true');
    expect(dockerfile).toContain(
      'COPY --from=builder /deps/node_modules/@neondatabase /app/node_modules/@neondatabase',
    );
  });

  it('requires deployment-owned signing keys in both Compose templates', () => {
    for (const file of ['.env.example', '.env.zh-CN.example']) {
      const example = readFileSync(path.join(deployDirectory, file), 'utf8');
      expect(example).toMatch(/^JWKS_KEY=$/m);
      expect(example).toMatch(/^CLERK_SECRET_KEY=/m);
      expect(example).not.toMatch(/^AUTH_SECRET=/m);
    }
  });

  it('uses the current Clerk auth contract in the Grafana deployment recipe', () => {
    const grafana = parse(
      readFileSync(path.join(deployDirectory, '../production/grafana/docker-compose.yml'), 'utf8'),
    );
    expect(grafana.services.casdoor).toBeUndefined();
    expect(grafana.services.orvilo.environment).toContain('KEY_VAULTS_SECRET=${KEY_VAULTS_SECRET}');
    expect(grafana.services.orvilo.environment.join(' ')).not.toMatch(
      /AUTH_SECRET|AUTH_SSO_PROVIDERS/,
    );
    expect(grafana.services.orvilo.entrypoint).not.toContain('AUTH_CASDOOR_ISSUER');
    const grafanaDirectory = path.join(deployDirectory, '../production/grafana');
    const composeSource = readFileSync(path.join(grafanaDirectory, 'docker-compose.yml'), 'utf8');
    expect(composeSource).not.toContain('init_data.json');
    expect(composeSource).not.toMatch(/casdoor/i);
    expect(existsSync(path.join(grafanaDirectory, 'init_data.json'))).toBe(false);
    for (const file of ['.env.example', '.env.zh-CN.example']) {
      const example = readFileSync(path.join(grafanaDirectory, file), 'utf8');
      expect(example).toMatch(/^CLERK_SECRET_KEY=/m);
      expect(example).toMatch(/^AUTH_ACCOUNTS_URL=/m);
      expect(example).not.toMatch(/^AUTH_URL=/m);
      expect(example).not.toMatch(/casdoor/i);
    }
  });

  it('delivers worker collaboration events over the internal gateway endpoint', () => {
    const gateway = 'COLLABORATION_GATEWAY_URL=http://collaboration-gateway:3012';
    expect(compose.services.orvilo.environment).toContain(gateway);
    expect(compose.services['hatchet-worker'].environment).toContain(gateway);
  });

  it('packages the Hatchet worker in the deployment image and keeps it out of the web container', () => {
    const worker = compose.services['hatchet-worker'];

    expect(worker.image).toBe(compose.services.orvilo.image);
    expect(worker.build).toEqual({ context: '../..', dockerfile: 'Dockerfile' });
    expect(worker.profiles).toEqual(['hatchet']);
    expect(worker.entrypoint).toEqual(['/bin/node', '/app/hatchet-worker/worker.mjs']);
    expect(compose.services.orvilo.environment).toContain('HATCHET_WORKER_ENABLED=0');
    expect(dockerfile).toContain(
      'RUN pnpm exec esbuild apps/server/src/hatchet/worker.ts --bundle --platform=node --format=esm --splitting --outdir=/app/hatchet-worker',
    );
    expect(dockerfile).toContain('--out-extension:.js=.mjs');
    expect(dockerfile).toContain('--external:sharp');
    expect(dockerfile).toContain('--external:@hatchet-dev/typescript-sdk');
    expect(dockerfile).toContain('--external:@copilotkit/channels-core');
    expect(runtimeDeps.dependencies['@copilotkit/channels-core']).toBe('0.11.0');
    expect(dockerfile).toContain(
      '--banner:js=\'import { createRequire as createRequireForHatchetBundle } from "node:module"; const require = createRequireForHatchetBundle(import.meta.url);\'',
    );
    expect(dockerfile).toContain('COPY --from=builder /app/hatchet-worker /app/hatchet-worker');
    expect(dockerfile).toContain(
      'COPY --from=builder /deps/node_modules/sharp /app/node_modules/sharp',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /deps/node_modules/@hatchet-dev /app/node_modules/@hatchet-dev',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /deps/node_modules/@grpc /app/node_modules/@grpc',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /deps/node_modules/@copilotkit /app/node_modules/@copilotkit',
    );
  });

  it('loads the split Hatchet worker bundle with the external SDK', () => {
    const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'orvilo-hatchet-worker-'));

    try {
      execFileSync(
        path.resolve('node_modules/.bin/esbuild'),
        [
          'apps/server/src/hatchet/worker.ts',
          '--bundle',
          '--platform=node',
          '--format=esm',
          '--splitting',
          `--outdir=${outputDirectory}`,
          '--entry-names=worker',
          '--chunk-names=chunks/[name]-[hash]',
          '--out-extension:.js=.mjs',
          '--loader:.md=text',
          '--external:pg',
          '--external:drizzle-orm',
          '--external:drizzle-orm/*',
          '--external:sharp',
          '--external:@hatchet-dev/typescript-sdk',
          '--external:@copilotkit/channels-core',
          '--banner:js=import { createRequire as createRequireForHatchetBundle } from "node:module"; const require = createRequireForHatchetBundle(import.meta.url);',
        ],
        { stdio: 'ignore' },
      );

      // The production image copies the runtime dependency tree next to the bundle. Recreate that
      // layout here so Node exercises the same ESM package resolution as the distroless worker.
      symlinkSync(path.resolve('node_modules'), path.join(outputDirectory, 'node_modules'), 'dir');
      const worker = path.join(outputDirectory, 'worker.mjs');
      const result = spawnSync(process.execPath, [worker], {
        env: {
          ...process.env,
          AGENT_RUNTIME_MODE: 'queue',
          HATCHET_CLIENT_TOKEN: '',
          NODE_ENV: 'test',
        },
        encoding: 'utf8',
      });
      const stderr = result.stderr;

      expect(result.status).not.toBe(0);
      expect(stderr).toContain('HATCHET_CLIENT_TOKEN is required');
      expect(stderr).not.toContain('ERR_UNSUPPORTED_DIR_IMPORT');
    } finally {
      rmSync(outputDirectory, { force: true, recursive: true });
    }
  }, 60_000);

  it('accepts Hatchet registration logs regardless of logger case', () => {
    expect(deployWorkflow).toContain("grep -Eiq 'worker .* listening for actions'");
  });

  it('never switches the search provider on behalf of the operator', () => {
    for (const service of [elasticsearch, reindex, sync, compose.services.orvilo]) {
      expect(
        service.environment?.some((entry) => entry.startsWith('FTS_SEARCH_PROVIDER=')),
      ).toBeFalsy();
    }
    for (const envExample of envExamples) {
      expect(envExample).not.toMatch(/^FTS_SEARCH_PROVIDER=/m);
    }
  });

  it('documents the explicit insecure in-network mode in both env examples without exposing a key', () => {
    for (const envExample of envExamples) {
      expect(envExample).toContain('# COMPOSE_PROFILES=elasticsearch\n');
      expect(envExample).toContain('# COMPOSE_PROFILES=elasticsearch,elasticsearch-sync\n');
      expect(envExample).toContain('# ES_URL=http://elasticsearch:9200\n');
      expect(envExample).toContain('# ES_ALLOW_INSECURE_HTTP=true\n');
      expect(envExample).toContain('# ES_INDEX_NAMESPACE=orvilo\n');
      expect(envExample).not.toMatch(/^#?\s*ES_API_KEY=/m);
      // Every optional line stays commented so the default deployment ignores the whole block.
      expect(envExample).not.toMatch(/^(COMPOSE_PROFILES|ES_[A-Z_]+)=/m);
    }
  });

  it('documents the plain-gRPC TLS override for self-hosted Hatchet in both env examples', () => {
    for (const envExample of envExamples) {
      expect(envExample).toContain('# HATCHET_CLIENT_TLS_STRATEGY=none');
    }
  });

  it('keeps the in-network Elasticsearch URL on plain HTTP when setup.sh switches to HTTPS', () => {
    const sedExpression =
      "'/^#\\{0,1\\} \\{0,1\\}[A-Za-z0-9_]*=/{/ES_URL=/!s|http://|https://|;}' .env";
    expect(setupScript).toContain(sedExpression);
    // The rewrite must only touch assignments: the warning comment that tells operators not to
    // pair ES_API_KEY with an http:// URL has to keep saying http://.
    for (const envExample of envExamples) {
      const rewritten = envExample
        .split('\n')
        .map((line) =>
          /^#? ?\w*=/.test(line) && !line.includes('ES_URL=')
            ? line.replace('http://', 'https://')
            : line,
        )
        .join('\n');
      expect(rewritten).toContain('# ES_URL=http://elasticsearch:9200\n');
      expect(rewritten).toContain('http:// ');
      expect(rewritten).not.toContain('https:// ');
    }
  });
});
