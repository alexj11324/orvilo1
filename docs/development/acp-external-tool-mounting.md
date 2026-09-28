# ACP external tool mounting (connectors / installed MCP plugins)

Remediation R03 (findings F04/F05 of the independent review): external
connector and installed-plugin tools now mount onto the same per-run MCP
surface as builtin tools, and required tools gate dispatch.

## Request → mount pipeline

1. `AiAgentService.execAgentWithReservation` collects candidate identifiers
   (`agentPlugins` active set + `additionalPluginIds` + `requiredToolIds` +
   `selectedToolIds`, or `exclusivePluginIds`) minus builtin
   tools/skills and calls `resolveExternalToolSurface` — a DB-side resolution
   against the caller's own rows only:
   - `user_connectors` via `ConnectorModel.resolveByIdentifiers(ids, agentId)`
     (agent-scoped row shadows workspace/personal) — mounted only when
     `isEnabled` and the synced `user_connector_tools` list is non-empty.
   - `user_installed_plugins` via `PluginModel.findById` — `callable` only when
     the row carries a manifest api list AND `customParams.mcp` (or
     `manifest.mcpParams`) transport params.
2. `resolveRunToolSurface` maps each requested id to exactly one outcome
   (`mounted`/`unsupported`/`unauthorized`/`failed` + machine-readable reason).
   External entries push a normal `AcpBuiltinToolSpec` onto `builtinToolSpecs`
   (the host mounts them on its `orvilo_cc` per-run MCP server) and are
   returned separately as `externalTools` for dispatch metadata.
3. `dispatchHeteroAgent` persists
   `metadata.externalTools = { identifier: { apis: string[], source } }` —
   api names and source only; transport params and credentials are never
   written to operation metadata. The operation JWT gains `hetero:tool:exec`
   whenever specs exist, same as before.

## Call path

The host's MCP server calls `aiAgent.heteroExecBuiltinTool` →
`execAcpBuiltinTool`. The allowlist is the union of `metadata.builtinTools` and
`metadata.externalTools[identifier].apis` — an op token can never invoke an
identifier the dispatch-time surface did not mount.

For `metadata.externalTools` entries the call is routed to `execAcpExternalTool`
which re-resolves the connection **at call time**:

- `connector`: `resolveByIdentifiers` (agent-aware) → `isEnabled` → synced tool
  present and not `disabled` → `ensureFreshConnectorToken` →
  `buildConnectorMcpParams` → `ToolExecutionService.executeTool(type: 'mcp')`.
- `mcp-plugin`: `PluginModel.findById` → `customParams.mcp` → same
  `executeTool` path with a manifest assembled from the plugin row.

Because both funnel through `ToolExecutionService`, the connector permission
gate (`getConnectorToolPermission`), stdio/private-URL device tunnelling,
result truncation and error classification behave identically to the classic
tool path. A credential revoked or a tool disabled _after_ dispatch fails the
call server-side — the persisted mount is never an authorization.

## Required-tool admission (F05)

`execAgent` accepts `requiredToolIds` (server-internal param; TaskRunner passes
its contract tool list). `resolveRunToolSurface` treats
`requiredToolIds ∪ exclusivePluginIds` as required:

- any required id resolving to `unauthorized`/`unsupported`/`failed` throws
  before dispatch (`Required tools failed to mount: <id> (<status>: <reason>)`);
- `disableTools` combined with required ids throws (`Required tools cannot
mount`) instead of silently dropping them;
- a partial mount is never dispatched — the throw propagates through
  `execAgentWithReservation` to the taskRunner outer catch, which settles the
  prepared dispatch row to `failed` and releases the run reservation.

## API contract change

`tRPC aiAgent.execAgent` input gains the server-only `requiredToolIds` (internal
params are not client-passable). `metadata.externalTools` is additive on the
operation row. `heteroExecBuiltinTool` accepts identifiers from the external
mount set — previously they were FORBIDDEN. No removals.

## Rollback boundary

Revert this PR: external ids fall back to `unsupported` (`plugin-not-installed`
reason), `requiredToolIds` callers must be reverted simultaneously
(TaskRunner is the only producer). `metadata.externalTools` on old rows is
ignored by the old code path (its `builtinTools` allowlist is unchanged).
