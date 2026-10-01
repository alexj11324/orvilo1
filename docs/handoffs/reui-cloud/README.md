# ReUI four-fix handoff to Devin

## Revisions and integration

- Tested exact baseline: `f2a9d4283fe206044918a9bf496274a2ddbc60bb`.
- Tested implementation HEAD: `15466979a6320f531071a6eca272bae4962d3d90` (preceding fix commit `504ff7e1354ed7b3cc0518c26989a6632677117f`).
- Delivery branch: `fix/reui-cloud-continuation`. The final delivery commit adds only this report and existing evidence. Obtain its exact SHA from the PR head; it is intentionally distinct from the tested implementation SHA.
- Stacked draft PR base: `feat/reui-sidebar`, PR #357. At publication inspection that branch is `a7d7f596a6af277b6a190fca0065bcf5010bfa48`; merge-base remains the tested f2a9d428 commit. Three-dot diff excludes the migration package. No rebase/merge of the advanced base was performed.
- Base has advanced substantially, including `a7d7f596` personal Settings routing changes and migration repairs. Compatibility with that advanced head is **not verified**. Review overlapping workspace/sidebar changes before integration; do not infer the 230 historical diagnostics still exist on its latest head.
- Recommended order: Devin completes/reconciles #357, integrates these four fixes with its current shell, then reruns targeted and product checks before retargeting/merging. #359 is already represented in the advanced migration history; do not merge its patch again. Provider/Memory, MCP Events and Prime/control-plane work are outside this PR; no runtime or migration dependency on them is introduced.

## Delivered behavior and files

1. Collapsed settings search expands and focuses with mouse/keyboard, retaining query: `SettingsSearch/SearchSection.tsx`, `ReUIShell/NavMain.tsx`, `components/ui/sidebar.tsx`. Real testing caught an unmounted settings panel and invisible label intercepting clicks; both repaired.
2. Narrow drawer is transient; closing/reopening/resizing does not overwrite desktop preference: `ReUIShell/SidebarShell.tsx`, sidebar provider, `store/global/initialState.ts`, `store/global/actions/workspacePane.ts`.
3. One appropriate toggle remains on Web/Linux desktop and narrow headers: `NavHeader/index.tsx`, `NavPanel/ToggleLeftPanelButton.tsx`, `ReUIShell/AppSidebar.tsx`. Existing macOS titlebar ownership retained.
4. Menu exposes actual workspace destinations, removing the Personal action immediately overwritten by existing No personal mode reconciliation: `ReUIShell/NavWorkspace.tsx`. No new personal product mode or scope authorization semantics invented.

Regression files: `ReUIShell/AppSidebar.test.tsx`, `ReUIShell/SidebarShell.test.tsx`, `store/global/actions/__tests__/leftPanel.test.ts`, `store/global/initialState.test.ts` (all under src/features or src/store as applicable). Implementation totals 14 files, 623 additions/48 deletions. Original 12-path raw handoff was absent in this session; restoration is behavioral, not byte-identical.

## Verification ledger

- Final implementation 15466979: 30/30 tests, four files; scoped production/test ESLint and commit-hook stylelint/prettier passed. Independent reviewer reports no remaining confirmed P1/P2. Evidence is linked below.
- Exact baseline f2a9d428 with initial regression cases: 14 failed/12 passed. Initial candidate504ff7e1 with subsequently added real NavMain cases: 3 failed/13 passed. These historical failures were fixed in final implementation.
- Matched TypeScript6.0.3 scoped comparison on exact baseline and final implementation: both exit2; 230 diagnostics each, all shared, introduced0/resolved0. No diagnostic in the 14 changed files. Same normalized config, external dependencies, and separately resolved workspace sources. Three added tests naturally absent baseline. This is **not a typecheck pass** and not full CI. Inventories distinguish existing UI API migration mismatches (old button/ActionIcon/InputNumber props) from cross-package alias/decorator diagnostics (99 TS2307,30 TS4113); do not label all as migration defects.
- Real authenticated Web and Linux Electron43.2.0 on final15466979 passed all four flows at1440x1000 and650x900. Electron actually ran main/preload/renderer under Xvfb, PID9898, loopback CDP29322, page `app://renderer/settings/profile`; this was not merely a Web browser pretending to be desktop.
- Only one disposable fixture workspace tested. Scope retained after click/settled reload; no second-workspace authorization test. Electron keeps its settings tab route; Web normalizes to tasks. Initial null during reload is not a persisted Personal mode.
- Full CI, macOS native titlebar/vibrancy, fresh clean-install release gate, advanced-base integration and cross-workspace switching remain unverified.
- Publication report/evidence-only commit: no tests/product rerun requested or claimed; business source remains exactly tested15466979. No further fixes will be made by this task.

## Reproduction and acceptance

Use an isolated checkout and supported dependencies; consult `docs/development/local-setup.md` for backend/migrations/seeding. Never reuse a real login profile or production database.

```bash
node node_modules/vitest/vitest.mjs run --silent=passed-only src/features/ReUIShell/AppSidebar.test.tsx src/features/ReUIShell/SidebarShell.test.tsx src/store/global/actions/__tests__/leftPanel.test.ts src/store/global/initialState.test.ts
bun run check --lint src/components/ui/sidebar.tsx src/features/NavHeader/index.tsx src/features/NavPanel/ToggleLeftPanelButton.tsx src/features/ReUIShell src/features/SettingsSearch/SearchSection.tsx src/store/global/actions/workspacePane.ts src/store/global/initialState.ts
bun run dev
# In a separate shell after disposable setup:
pnpm --dir apps/desktop dev
```

Lint autofixes; inspect its diff. Full `bun run check --type` is CI-only per AGENTS.md, not a local bypass. For matched scoped reproduction, create identical configs extending each checkout's tsconfig, include the14 changed files plus src/test d.ts and a common shim referencing next and next/image-types/global, disable incremental, clear references/exclude, and run the same `tsc -p <config> --pretty false` in both. Exclude generated .next declarations; compare file/code/full-message multisets after root normalization. Attached diagnostic inventories and independent methodology review preserve the result.

Product steps: open settings, collapse sidebar, activate Search settings by normal mouse and Enter, assert focus and type appearance; clear query, test expanded and collapsed preferences through narrow open/Escape/reopen then widen, assert only one applicable toggle; cold reload and assert collapsed persistence; open workspace menu, ensure no selectable Personal, select actual fixture workspace, read settled active scope after reload. Repeat in real Linux Electron with fresh fixture profile, inspect process and app-origin page. Wait for initialization, not just header visibility.

## Setup caveats, remaining work and resources

Cloud Debian13.6 only. Validation used existing cloud dependencies; temporary Next Turbopack root override allowed linked dependencies, then was restored. Standalone desktop installed lucide0.562 lacked GlobeOff, so an untracked dependency link aligned it with root1.48; generated shared Vite cache was cleared. No manifest/lock/product-auth changes. Thus evidence is under this disclosed setup, not clean-install evidence. Optional GitHub account requests failed because no external account was configured.

Dedicated fixture containers `reui-acceptance-postgres` (25433) and `reui-acceptance-redis` (26380) are stopped with data retained. Next/Vite/Electron/Xvfb/browser processes stopped; remaining task agent-browser helper was terminated during publication cleanup. Private fixture profiles, generated tokens/JWKS, runtime.env and dependency caches remain local and are deliberately excluded. No machine-absolute-path configuration is required by this PR.

Devin owns advanced-base reconciliation, canonical CI and any remaining cross-platform coverage. There is no known unresolved confirmed P1/P2 on the tested revision; a failing overall scoped typecheck and the coverage/setup limitations above remain explicit blockers to claiming a clean release gate.

## Safety and delivery boundaries

Existing Electron `apps/desktop/src/main/core/browser/Browser.ts` has `sandbox:false`; actual renderer ran with --no-sandbox despite no extra launcher flag. Unchanged baseline limitation; **not** Prime/process-tree isolation evidence. Do not weaken it further or claim runtime isolation from these UI checks. Preserve transient drawer vs persisted desktop state and real workspace scope; never infer authorization from UI labels. No real credentials, user DB/profile, deployment, force push, merge or modifications to Devin's branch. Only normal independent-branch push and draft PR are authorized.

## Evidence

- [Final unit log](evidence/reui-final-tests.log)
- [Independent review](evidence/independent-review.md)
- [Type comparison](evidence/type-comparison.json) and [independent methodology review](evidence/type-review.md)
- [Web results](evidence/web-final-results.json), [Electron results](evidence/desktop-final-results.json), [settled Electron scope](evidence/desktop-active-workspace.json)
- [Web focused search](evidence/web-search-focused-final.png), [Electron search](evidence/desktop-search-final.png), [Electron narrow drawer](evidence/desktop-drawer-false-final.png), [workspace menu](evidence/web-workspace-menu.png)

Artifacts record tested15466979, not the later report-only delivery commit. Full diagnostic inventories included; raw runtime logs with possible fixture data are intentionally excluded.
