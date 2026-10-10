# Agent management tool Tailwind migration

Related to #577.

## Scope

Replace all 16 direct antd-style imports in the agent management tool client with Tailwind utilities. This covers its inspectors, result previews, agent cards, and create-agent streaming preview. Existing labels, argument fallbacks, plugin results, store selectors, and navigation remain unchanged.

Use existing semantic tokens for secondary text, container backgrounds, hover fill, status colors, and secondary borders. Preserve the exact tertiary text, quaternary fill, and primary badge variables where no equivalent is established. Local Avatar accepts CSS colors directly, so its container-background fallback now uses `var(--card)` instead of subscribing to the Ant theme. Preserve custom avatar backgrounds.

## Validation

Run the scoped repository check and normal commit hooks; review the resulting diff independently before merge. No source-string tests are added for this styling-only change. No Electron or real-device visual acceptance has been performed; CI and source review do not establish visual parity.

Shared Markdown and highlight/shimmer components still use the legacy stack. This batch does not change the global Ant CSS layer or remove dependencies; #577 remains open.
