# Slimming 06 — Skill Store / standalone marketplace surface (ORV-104)

## Audit verdict

The Skill Store frontend surface (browse list, categories, search, detail page,
submit-to-market flow) was already retired. What remained was the residual
plumbing behind it — deleted here — while the ACP-facing seams (fork/install a
community agent or MCP server from a link, credential injection for skills)
stay live.

## Kept (live seams)

- `market` lambda router narrowed to: `getAssistantList` / `getAssistantDetail`
  / `getAgentsByPlugin` / `getMcpList` / `getMcpDetail` / `getMcpManifest` /
  `getPluginDetail` / `getPluginList` (unified-search `type=plugin` consumer) /
  `registerClientInMarketplace` / `registerM2MToken` / `submitFeedback` plus the
  `agent` (fork + onboarding), `creds`, `oidc`, `user` sub-routers.
- `DiscoverService` trimmed to the matching methods (+ `callCloudMcpEndpoint`,
  `reportCall` for tool execution, `registerClient`/`fetchM2MToken` M2M auth).
  `getPluginDetail` computes its `related` list directly from the legacy
  `_getPluginList` — no more dependency on the storefront `getPluginList`.
- `discover` zustand store collapsed to `useFetchMcpDetail` + `usePluginDetail`
  (only two consumers: `MCP/MCPDetail` install-modal detail and
  `ProfileEditor/PluginTag` + `ToolTag` plugin detail).
- `mcpStore` keeps install/test-connection actions + progress state only; the
  browse-list state (`mcpPluginItems`, `listType`, pagination, search,
  categories/tags) and its selectors (`mcpPluginList`, `getPluginById`,
  `activeMCPPluginIdentifier`) are gone. `installMCPPlugin` now always resolves
  the plugin through `discoverService.getMcpDetail`.

## Deleted

- **Client storefront plumbing**: `services/marketApi.ts`,
  `features/AgentMarketSubmission` (hook + test), all dead `discover` slices
  (`assistant`/`groupAgent`/`model`/`provider`/`user`), `Header` market-review
  entry + `AgentForkTag`/`AgentStatusTag`/`AgentVersionReviewTag`,
  `GroupProfile` `GroupForkTag`/`GroupStatusTag`/`GroupVersionReviewTag`,
  `features/MCP/MCPDetail/index.tsx` (unmounted detail host; `Loading` stays
  for the install modal), `report*` telemetry call sites in `mcpStore/action`.
- **Routers**: `klavis` stub router (+ scope entry + test), market
  `agentGroup` router (+ test), `marketDeployments` business-server router,
  `(backend)/market/*` route shells (`agent`, `oidc`, `user/[username]`,
  `user/me`), and `market/agent` write procs except `forkAgent` +
  `getOnboardingFull` (community fork is live).
- **Locales**: `marketSubmission.*` + `marketPublish.*` (`setting`), the
  storefront half of `discover` namespace (719 → 127 keys), 85 dead `plugin`
  keys — mirrored in `en-US`/`zh-CN`.
- **SWR/registry**: dead `tool:mcpPluginList` and storefront `discover:*` keys
  (`skillAgents`, `skillStoreMarketSkills`, `userProfile`); `mcpAgents` kept
  (MCP detail related-agents panel).
- `klavis` removed from `apiKeyScope` (router gone).

## Validation

- `bun run check` on the 38-file diff: lint clean, 153 related tests green.
- `apps/server` typecheck: no new errors vs baseline (300 pre-existing
  monorepo errors; the only ones touching edited files are the pre-existing
  `next:` RequestInit augmentations unchanged at HEAD).
