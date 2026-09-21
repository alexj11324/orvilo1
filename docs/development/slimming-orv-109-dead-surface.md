# Slimming 10 — Dead routes, stores, locales and docs (ORV-109)

Front-of-house sweep for the retired capability stacks: removes the leftover
client-side residue (orphaned feature components, stores, locale namespaces)
and the documentation that described surfaces users can no longer reach.

## Deleted code

- `src/store/verify/` — orphaned Zustand store of the retired standalone
  Acceptance/Verify portal. No importer remained (even its `@/services/verify`
  types module was already gone); live acceptance editing happens inside task
  review via `apps/server/services/verify`.
- `src/features/OllamaSetupGuide/` — duplicated dead copy of the live
  `src/features/Conversation/Error/OllamaSetupGuide` (which wraps
  `src/components/OllamaSetupGuide` for the still-live Ollama error path).
- `src/hooks/useDownloadImage.ts` — orphaned hook whose only string was the
  generation-era `image` namespace.
- `packages/const/src/url.ts` — dead `BASE_PROVIDER_DOC_URL` and
  `channelDocUrl` (both pointed at docs trees that no longer exist).

## Deleted locale namespaces

`migration` (v1→v2 upgrade UI), `image` (generation download toast), `models`,
`models.vite`, `providers.vite` (BYOK model/provider card descriptions) — none
had a remaining `useTranslation`/`ns:` consumer.

- `packages/locales/src/default/{migration,image,models,models.vite,
providers.vite}.ts` and their `default/index.ts` registrations.
- `packages/locales/src/{orviloOnlineModelDescriptions,modelDescriptionOverrides}.ts`
  (+ test) — consumed only by the deleted `models`/`models.vite` defaults.
- `locales/*/{migration,image,models}.json` across all 18 locales (54 files).
- `serverTranslation.test.ts` — the `'models'`-ns fallback test was duplicated
  coverage of the `'chat'` one below it; dropped the dead mock + test.

## Deleted docs

- `docs/usage/providers/` (160 mdx across EN/ZH) + `providers.{mdx,zh-CN.mdx}` —
  per-provider BYOK setup guides; the in-product provider settings surface was
  retired in ORV-101.
- `docs/usage/getting-started/generation.{mdx,zh-CN.mdx}` — image/video
  generation guide; surface removed in ORV-106.
- Inbound links cleaned: `start`, `help`, `orvilo-ai`, `vision`, `resource`
  (EN+ZH), `self-hosting/examples/ollama`, `environment-variables/model-provider`
  (links now point at the vendors' official docs or are dropped). Stale
  mid-conversation model-switching claims in `start.*` were trimmed to match
  the deployment-catalog behavior.
- `.agents/skills/add-model-provider/references/documentation.md` — dropped the
  per-provider usage-guide step; the skill now covers deployment env vars only.
- Kept: `docs/usage/community/*` (external marketplace product still exists —
  the repo keeps its market API proxy) and `docs/self-hosting/
environment-variables/model-provider.*` (deployment-level `ENABLED_*` /
  `<ID>_API_KEY` vars remain the real provider configuration).

## Verified

- Routers already carry redirect shims for every retired path
  (`/community/*`, `/page/*`, `/acceptance/*`, `/verify/*`,
  `/settings/provider*` on both desktop and mobile routers) — no dead routes
  left; unchanged here.
- Repo-wide `tsgo --noEmit`: clean. `bun run check` on touched sources: lint
  clean, 25 related tests pass.
