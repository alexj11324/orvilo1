# @orvilo/sdk

Official TypeScript SDK for the [Orvilo REST API](https://orvilo.aspectlylabs.com/api/v1/docs), generated from the OpenAPI spec in [`packages/openapi`](../openapi) via [@hey-api/openapi-ts](https://heyapi.dev).

Resource-style methods with full typing — every path, parameter, request body, and response comes from `openapi.yml`, and the HTTP runtime is inlined (zero dependencies).

## Installation

```bash
npm install @orvilo/sdk
```

## Usage

```ts
import { createOrvilo } from '@orvilo/sdk';

const orvilo = createOrvilo({
  // Orvilo API Key (`sk-ov-...`) or an OIDC JWT
  apiKey: process.env.ORVILO_API_KEY!,
});

const me = await orvilo.users.me();
const { data, error } = await orvilo.agents.list();
const agent = await orvilo.agents.get({ path: { id: 'agt_...' } });

await orvilo.agentGroups.create({ body: { name: 'My group' } });
await orvilo.files.uploadBatch({ body: { files: [/* … */] } });
```

Resources map to the API's top-level path segments: `health`, `agentGroups`, `agents`, `files`, `knowledgeBases`, `messageTranslations`, `messages`, `models`, `permissions`, `providers`, `responses`, `roles`, `topics`, `users`. Method names follow a fixed rule — `list` / `get` / `create` / `update` / `delete` plus PascalCase sub-segments (`files.listChunks`, `roles.updatePermissions`) — with a few curated names (`files.uploadBatch`, `files.query`, `knowledgeBases.addFiles`, `users.me`).

Point the client at another deployment with `baseURL`, and pass any other client option (custom `fetch`, `headers`, …):

```ts
const orvilo = createOrvilo({
  apiKey: 'sk-ov-...',
  baseURL: 'http://localhost:3010',
});
```

Raw spec types are exported from `@orvilo/sdk/types`.

### Streaming responses

`responses.create` returns Server-Sent Events when `body.stream: true`. Opt out of JSON parsing with `parseAs: 'stream'` and read the raw stream from `response.body`:

```ts
const { response } = await orvilo.responses.create({
  body: { input: '…', model: '…', stream: true },
  parseAs: 'stream',
});
for await (const chunk of response.body!) {
  // decode SSE chunks
}
```

(First-class typed SSE methods will come with the spec's response schemas.)

## Development

- `bun generate` — regenerate `src/generated/` from `../openapi/openapi.yml` (run after the spec changes; naming rules live in `openapi-ts.config.ts`)
- `bun run build` — build ESM + d.ts to `dist/`
- `bun run test` — unit tests + generated-output drift check (local and release workflow only; not wired into PR CI)

## Releasing

Publishing is automated by [`release-sdk.yml`](../../.github/workflows/release-sdk.yml): every push to `canary` touching `packages/sdk/**` publishes `1.0.<UTC timestamp>` to npm with provenance (manual `workflow_dispatch` also available). To ship a spec change, run `bun generate` and commit the regenerated output — the workflow's drift check (`bun scripts/generate-sdk.ts --check`) guards the published artifact.

Regular PR CI does not gate on spec drift — the check runs locally (`bun run test`) and inside the release workflow only.
