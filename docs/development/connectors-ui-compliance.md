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
