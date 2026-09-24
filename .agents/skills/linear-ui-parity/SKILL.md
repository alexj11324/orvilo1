---
name: linear-ui-parity
description: 'Use when implementing or auditing Orvilo screens against the live Linear product, including page inventory, two-way UI comparison, runtime acceptance, and final page-by-page review.'
---

# Orvilo ↔ Linear UI parity

The target is symmetric: every Linear element and behavior in the agreed surface must exist in Orvilo, and every Orvilo element without a Linear counterpart must be removed or brought into the matching flow. Do not treat an Orvilo-only control as an acceptable extra merely because it is useful. An explicit user exception takes precedence; record its exact scope.

## Establish a comparable pair

1. Enumerate the current Linear navigation, including menus, collapsed groups, and relevant deep links. Pair every page with its Orvilo route. Update the page inventory when either side changes; a historical matrix is a lead, not current proof. Keep workspace, team, project, and issue scopes distinct.
2. Record the reference and candidate URL, revision, locale, theme, viewport, and data state. Compare populated pages with comparable records and empty pages with empty pages. If the data differs, limit conclusions to the geometry or behavior the pair can actually prove.
3. Inspect the live Linear product and the running Orvilo product. Use hit-tested clicks for interaction claims and read computed styles or DOM geometry for visual claims. A source read, a test, a static screenshot, or an empty fixture alone cannot establish parity. Do not mutate Linear records without authorization.

## Compare in both directions

Use [the audit dimensions](references/audit-dimensions.md) for each page, its menus and detail panes, and its loading, empty, error, permission, narrow-window, and dark states. Record each difference as **missing in Orvilo**, **extra in Orvilo**, **different**, or **unverified**. Check navigation and data semantics before tuning pixels: the same-looking row can query a different scope or write a different state.

Make focused changes in an isolated worktree. Preserve unrelated changes. Run the repository's scoped `bun run check` for touched files; full `tsgo` belongs to remote CI. Then exercise the affected real product path, including the click result and any write/readback when behavior changed. Save reviewer-readable evidence on the PR or as a CI artifact, bound to the source commit. Keep the PR draft while known parity gaps or required verification remain.

## Completion gate

Maintain one row per page and reachable state in the parity inventory. A page is complete only when the current reference and candidate have been compared in both directions, remaining differences have been fixed or explicitly excepted by the user, and runtime evidence covers the delivered revision. Tests and green CI are additional gates, not substitutes for this comparison.

Before claiming the whole project aligned, assign an **independent subagent** that did not implement the pages to inspect every inventory row, both directions of the UI, and the linked evidence. Give it the live routes, revisions, artifacts, and known exceptions; require a finding for any omitted page, unverified state, or unsupported completion claim. Resolve its findings and rerun the relevant real paths before closing the parity work.
