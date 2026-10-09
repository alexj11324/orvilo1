# Connectors UI compliance

Scope: `src/features/Connectors/**` and the connector settings page
(`src/features/Settings/connector/**`). Presentation, accessibility and copy only; no data flow changes.

## Rules applied

- **i18n**: every user-visible string in `ConnectorDetail`, `ToolPermission*` and `CustomConnectorModal`
  goes through the `tool` namespace. New keys live in `packages/locales/src/default/tool.ts` and are
  mirrored to `locales/en-US/tool.json` and `locales/zh-CN/tool.json`; other locales fall back to
  English until the daily i18n workflow runs.
- **Tokens**: the undefined `var(--lobe-colors-*)` variables are gone. Colors come from antd-style
  `cssVar.*` or Tailwind semantic classes. No raw colors, no `!important`.
- **Inline styles**: replaced by Tailwind utilities or `createStaticStyles`.
- **Keyboard**: the per-tool permission control (auto / needs approval / disabled) is a
  `ToggleGroup` from `@/components/ui/toggle-group`. Every item is a focusable button with an
  accessible name and `aria-pressed`. The group header is a real `<button aria-expanded>`.
- **Dead code**: `Connectors.tsx`, `ConnectorList/` and `AddConnectorModal/` had no importers
  (only the barrel `index.ts` re-exported them) and were removed together with their i18n keys.

## Not changed

- `ConnectorDetail` header height stays 42px so it lines up with the left pane header
  (`Settings/connector/features/LeftPanel.tsx`). Moving both to a ruler value is a separate change.

## Round 3: selection, row structure and lifecycle actions

- **Every row selects.** Rows of connectors that were not connected had no click handler (`onClick={isConnected ? onSelect : undefined}`, and the GitHub/Linear preset rows only selected once a connector record existed), so a click did nothing and the selection stayed on the previous row. All rows now select. A not-connected row opens `NotConnectedDetail` (name, description, a Connect action, no Disconnect or Delete). A preset without a connector is keyed `mcp-preset:<id>` (the bare preset id collides with the OAuth catalog ids), and the selection moves to the connector pane once the preset gets a connector. `isSelectionResolvable` (pure, tested) keeps catalog and preset selections from being dropped by the "row no longer exists" check, because they have no server or connector record.
- **Row structure.** `ConnectorRow` is a plain container with a stretched select button (`after:absolute after:inset-0`) and the action as a sibling (`relative z-10`), so no interactive element is nested in another. The preset Connect flow moved into `useMcpPresetConnect` and the preset form / GitHub connect state into `useConnectorPresetActions`, hoisted to `ConnectorSettings` so the list row and the detail pane share one Connect action.
- **Lifecycle actions follow the connection state.** `getConnectorLifecycleActions` (pure, tested) decides which of Connect, Disconnect, Delete and Uninstall the pane shows: Disconnect only while the connector is enabled and `status === 'connected'` (the same condition the row uses for "Connected"); Delete only for user-added (`custom`) connectors; Uninstall for builtin and marketplace tools. An unconnected preset connector shows Connect instead of Disconnect.
- **Team home.** `TeamResources` wrapped a `<button>` in `DropdownMenuTrigger`, which already renders a `<button>`; the trigger now carries the label, class and icon itself.
- Not changed: `StaleGitSnapshot` renders a `<div>` inside `DropdownMenuTrigger` (valid, but not keyboard-labelled); a Composio server in `pending_auth` or `error` shows Connect in the pane that does nothing, while its list row offers Re-authorize.
