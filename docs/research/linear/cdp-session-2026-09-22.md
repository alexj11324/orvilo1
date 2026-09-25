# Linear reference CDP session recovery — 2026-09-22

The old reference endpoint `127.0.0.1:9333` belonged to a separate Brave process launched with `--user-data-dir=/tmp/brave-linear-ref`. It was not the user's normal personal profile. Fresh Projects deep links in that profile remained at Loading, although a loaded tab could navigate through the app after Page.bringToFront. These observations do not identify the storage/network root cause. The process later exited; no profile files, cache or credentials were reset.

The working replacement is the Brave browser connector for the normal personal profile. Claim an existing user Linear tab, or open a fresh reference tab in that browser session; then obtain its `cdp` capability. Runtime.evaluate and Emulation.setDeviceMetricsOverride work through that capability, preserving actual CDP DOM/computed-style/geometry evidence. Do not treat connector browser IDs or tab IDs as persistent: a browser restart replaced them during this session.

Verified in the normal profile:

- A fresh `https://linear.app/bdiverifier/projects/all` tab advanced from its initial Loading state to Projects, with 579 main descendants, six project rows and no captured console errors.
- A fresh My issues Assigned tab loaded its nonempty urgent/blocking groups and 1535 main descendants.
- Project display/filter/status menus were opened for observation without choosing values. The project sidebar was opened and closed again. No reference project/task data was written.

## Projects baseline, 1440×900

Main x244, right1432. Row x244.5, y128, width1176, height48. Grid column gap6: indent8, checkbox18, title582, health130, priority68, lead48, targetDate91, issues49, status120, end-padding8. At1600 the row width becomes1336 and title742; all other tracks are fixed. The vertical scroll host reserves an11px stable scrollbar gutter.

Header Projects is h2 13px/500 Inter Variable, x262.5,y22.5; ordinary All projects link has28px height. Header actions are New project, Add new view, Add filter, Display options, Open sidebar. The status percentage opens Change status, with In Progress selected despite100% tasks completed. Its glyph is a lifecycle icon, not an arc determined by that completion percentage.

Display options include List/Board/Timeline, grouping, ordering, closed-project filtering and property visibility. The filter menu includes AI/advanced filters plus project fields. These are product capabilities beyond the current minimal list renderer; they must not be represented by inert buttons.

## My issues baseline, 1440×900

Header My issues is h2 13px/500 Inter Variable, x262.5,y22.5. Toolbar plain links Assigned/Created/Subscribed/Activity start y60.25, height28, font12px/500. Right controls: Add filter, Display options, Open details. No separate No project / Delegated / List / Board / Save as controls appear there.

First urgent group starts y96, first task row y134, height44, x244.5,width1176. Grid gap8: indent8, checkbox18, priority16, identifier73, status16, title911, createdAt60,end-padding18. Identifier x310.5; task title x415.5 at13px/500; metadata12px/450; avatar18px with9px initials.

## Automatic collector runtime smoke

After collector commit `4614986d9`, the current candidate Electron Projects page was captured on 2026-09-22 at `app://renderer/ws-useragenttes/projects`, 1440×900. The worktree also held unrelated uncommitted page slices, so this is collector-path evidence rather than a product-parity verdict. `cdp-snapshot.cjs` read all 6,025 of 6,025 DOM elements without truncation and produced 768 inventory entries, including 177 geometry-bearing opacity-hidden semantic entries. Among those latent entries, 97 carried SVG semantics, 19 direct text, 28 ARIA roles, and 33 interactive-control semantics. The snapshot marks 197 inventory entries as `potential-hover-not-tested` and leaves `interactionManifest.complete=false`; static capture has not verified hover or click results. The disposable snapshot is `/tmp/orvilo-cdp-latent-20260922.json`.
