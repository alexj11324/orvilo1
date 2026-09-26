# Linear import entry and Team Home correction (2026-09-26)

## Why Recent issues remained on canary

The Team Home Recent issues block was present in canary after PR #225
(`a8968f673`, 2026-09-25). The later removal (`efb70d710`) was committed on
`feat/linear-parity-feed`. PR #257 merged that branch into
`devin/v6-linear-polish`, not canary. The promotion PR #209 from
`devin/v6-linear-polish` to canary had already closed without a merge.
Therefore the removal never reached canary. This is a branch promotion gap;
there is no canary commit that deleted the block and then restored it.

The authenticated Linear Team Home reference did not show Recent issues in the
matching state. The earlier Orvilo runtime check used the block to exercise
status icons; it did not establish that the block belonged on Team Home.
See `docs/research/linear/runtime-acceptance/team-home-20260924/README.md`.

## Delivered correction

- Team Home Overview no longer queries or renders the Recent issues block.
  The empty Resources section and Members/Go to rail remain.
- The workspace settings sidebar offers Imports and no longer offers Linear
  sync. On Web/Electron, a saved `/:workspaceSlug/settings/linear` link redirects
  to `/:workspaceSlug/settings/imports/linear`. On mobile, where the new
  importer has no route, the legacy link returns to workspace settings.
- The Web and Electron SPA entries load the ReUI stylesheet at startup. The
  SPA is served from Vite HTML, so Next's root layout did not load that CSS.
  A route-local import made styling depend on navigation history.
- Two heterogeneous-session loading marks use the existing Orvilo component
  because the currently resolved `@lobehub/ui` no longer exports it.

## Verification and remaining evidence

Focused checks passed: Team Home navigation tests (6), workspace settings and
desktop router tests (79), mobile router tests (21), plus scoped lint.
The production Vite SPA build succeeded and its entry HTML links the CSS
containing ReUI utility rules. This proves packaging, not visual appearance.

An authenticated deployed Web/Electron comparison is still required before
claiming the importer and Team Home visually accepted. The browser session
available during this fix was signed out. PR #282 remains draft until that
runtime check and its exact-head CI gates pass. The separate Linear catalog
GraphQL correction is owned by PR #281.
