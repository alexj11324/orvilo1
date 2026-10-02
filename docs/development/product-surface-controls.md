# Product surfaces use the design system

Product surfaces — `src/features/**` and `src/routes/**` — must be assembled
from the repo's design system (`@/components/ui/*` ReUI wrappers,
`@/components/reui/*`, `@/components/SelectOptions`), never from raw HTML form
controls or one-off control kits. The `Native Controls` CI gate
(`scripts/ci/checkNativeControls.mjs`, also wired into `bun run check` via
lint-staged) fails on literal `<select>`, `<input>`, `<textarea>` and
`<button>` JSX, on `appearance-none`/`form-select` styling hacks, and on
form-control imports from `@lobehub/ui/base-ui`. Legitimate owners of raw
controls — the design-system implementation itself, sanctioned admin/config
surfaces, and pre-existing debt being migrated — are declared in
`scripts/ci/nativeControlsAllowlist.json`: every entry must state a `reason`,
and `counts` entries cap the number of existing violations so additions still
fail while removals shrink the ledger. To request an exemption, add the file
(or pattern) to the allowlist with its reason in the same PR — reviewers treat
each entry as a reviewed exception, not a hole.

Inline search/filter fields inside menus and popovers follow the same rule:
compose the ReUI `Input` (`@/components/ui/input`) and neutralize its chrome in
the surface's stylesheet (height/radius/ring) rather than dropping to a literal
`<input>` — the gate scans JSX tags, not rendered elements.
