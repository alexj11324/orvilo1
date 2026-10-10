# Agent builder tool Tailwind migration

Related to #577.

## Scope

Replace the six direct antd-style imports in the agent builder tool client with Tailwind utilities and existing semantic CSS tokens. Cover installation/configuration/prompt inspector states, tool search metadata, prompt diff and fallback previews, and the streaming prompt container.

Preserve prompt diff generation, truncation, labels, result conditions, configuration field selection, and streaming behavior. Keep existing tertiary/description text, quaternary fill, and runtime container-radius variables where their exact values have no established replacement. The prompt preview retains its existing asymmetric logical margins and word-break behavior.

Shared Markdown, inspector root, and shimmer remain outside this batch. No new tokens, dependencies, global CSS-layer changes, or route/store changes.

## Validation

Run scoped repository checks and normal commit hooks, then independent light review. No source-string tests are added for this styling-only migration. No Electron or real-device visual acceptance has been performed; source review and CI do not establish visual parity. #577 remains open.
