# Group management preview Tailwind migration

Related to #577.

## Scope

Replace ten direct antd-style imports across group-tool inspectors, streaming previews, and Broadcast/Speak result previews. Preserve group/agent selection, task parsing, empty conditions, labels, Markdown rendering, and custom avatar backgrounds.

Use existing foreground, muted-foreground, card and card-radius tokens. Keep exact quaternary-fill variables where no semantic equivalent exists. Default Avatar and AvatarGroup backgrounds use the existing `var(--card)` value, so memoized avatar entries follow CSS theme changes without holding resolved Ant colors. The assignment inspector retains the shared shimmer-group class and its positioning behavior.

Task intervention forms and ExecuteTask/ExecuteTasks result panels remain outside this batch, together with shared Markdown and shimmer components. No global CSS-layer change, new tokens or dependency changes.

## Validation

Run scoped repository checks and normal commit hooks, then independent light review. No source-string tests are added for this styling-only change. No Electron or real-device visual acceptance has been performed; source review and CI do not establish visual parity. #577 remains open.
