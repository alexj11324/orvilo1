# Responsive + Dark-Mode Evidence — 2026-09-23

Candidate: Electron `app://renderer` workspace `ws-useragenttes` at CDP :9222.
Capture method: `cdp-inspect.cjs` — `Emulation.setDeviceMetricsOverride` per shot
(1440 / 1024 / 800 × 900, dpr 2) + `Page.captureScreenshot` + in-page DOM metrics
(`*-{w}.json` next to each PNG records url, vw, rail geometry, panes, overflow,
error markers, text sample — the PNG and its JSON are one atomic observation).

**Concurrency caveat:** the CDP tab is shared with another agent that was
navigating, changing viewport, triaging inbox fixtures and (later) live-editing
`taskDetailLayoutStyles.ts` through a broken vite compile. Every capture is
validated for url + viewport + painted DOM; anything caught mid-race was
re-shot. Residual risk noted per surface.

## Chrome model (measured, applies to all surfaces)

- Workspace sidebar (`base-draggable-panel`): **244 px expanded at vw ≥ 960**;
  **collapses to `width: 0` below \~960** (verified 960 open vs 900 closed).
  When collapsed, content reflows full-bleed (`x=1, w=790` at 800) and a
  `panel-left-open` toggle appears in the top-left titlebar. Sidebar DOM
  persists clipped inside the 0-width wrapper — inner rail rect still measures
  \~230 px in the JSON metrics, which is the clipped inner content, not a
  visible sidebar. **PASS.**
- Right **agent portal column** ("话题 / 问我关于你的任务" composer):
  fixed **407 px** at every measured width — 1440 (x=1024), 1024 (x=608),
  800 (x=384). It does **not** auto-collapse at the collapse point; at 800 it
  occupies \~51 % of the viewport and squeezes the working list to \~384 px.
  Portal open-state varied between captures (shared session toggle);
  where present it is always a hard 407 px column. **GAP.**
- Working list column: 1440 → \~780 px, 1024 → \~364 px, 800 → \~384 px.
- No page-level horizontal overflow anywhere (`scrollWidth == clientWidth`
  on every capture — `hOverflow: 0`).
- Back affordance: only the global titlebar back/forward arrows
  (`lucide-arrow-left/right`, y≈7). **No master-detail "back to list" button
  found on any surface at any width.** Toolbar rows carry `lucide-ellipsis`
  overflow menus; no clipped toolbars observed. See per-surface notes.
- Error surfaces observed during the sweep:
  - Sidebar region transient `加载工作区失败 / 重试` (seen once on /views at
    start of session; recovered on its own).
  - Route ErrorBoundary `ERROR / 页面暂时不可用 / 重新加载 / 返回首页 /
错误堆栈` recurring on inbox surfaces — see inbox-detail note.

## Per-surface notes

Naming: `<surface>-<width>.png`. "Portal" = 407 px agent column described above.

| surface          | 1440                                                                                   | 1024          | 800                                            | verdict                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inbox            | list + portal                                                                          | list + portal | sidebar→0, list full-bleed                     | **DEGRADED PNGs** — shots on disk are late re-shots taken while the renderer was unmountable (see report gap 7: vite PARSE\_ERROR → bare `antd-style` specifier → `#root` empty), so they show a bare shell; paired `inbox-*.json` metrics are from the healthy 05:08 capture (rail 244/236/collapsed-229, real list text). Re-shoot when the renderer mounts again                                           |
| inbox-detail     | list+detail `?item=…0003&detail=1`                                                     | same          | same                                           | **GAP** — detail deep-link lands on route ErrorBoundary `页面暂时不可用` once the item id is dead (it was triaged by the concurrent agent mid-sweep; error card confirmed live at 05:33+). A dead `?item=` id crashes the whole inbox surface instead of falling back to the list — and the boundary persists across same-route navigation until `重新加载`. PNGs reflect whichever state was live at capture |
| my-issues        | list + portal                                                                          | list + portal | collapsed sidebar, single working column       | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| reviews          | queue list + portal                                                                    | list + portal | collapsed; stacked cards (text ↑ at 800)       | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| drafts           | drafts list + comment column + portal                                                  | same          | collapsed; portal still 407 px                 | PASS w/ portal caveat                                                                                                                                                                                                                                                                                                                                                                                         |
| projects         | projects list + portal                                                                 | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| views            | views directory — **effectively empty** (no saved views; only shell+debug chrome text) | same          | same                                           | **GAP-ish** — directory has no saved views, so `view-detail` has no target (documented, not a defect if fixture lacks views)                                                                                                                                                                                                                                                                                  |
| view-detail      | —                                                                                      | —             | —                                              | **SKIP** — zero `a[href*="/views/"]` links exist; workspace has no saved views                                                                                                                                                                                                                                                                                                                                |
| team-home        | team page + tab row                                                                    | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| team-triage      | triage queue                                                                           | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| team-issues      | issues list                                                                            | same          | collapsed; portal 407 px                       | PASS w/ portal caveat                                                                                                                                                                                                                                                                                                                                                                                         |
| team-projects    | team projects                                                                          | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| team-views       | team views                                                                             | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| project-overview | overview tab                                                                           | same          | collapsed; more text at 800 (stacked sections) | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| project-issues   | project tasks list                                                                     | same          | collapsed                                      | PASS                                                                                                                                                                                                                                                                                                                                                                                                          |
| members          | members list + portal                                                                  | same          | collapsed; portal 407 px                       | PASS w/ portal caveat                                                                                                                                                                                                                                                                                                                                                                                         |

## Dark / light theme

- App default renders `data-theme="dark"`; theme state = `system` (monitor
  icon) resolving to dark. `localStorage.theme` absent until user picks.
- **A real light toggle exists**: sidebar footer avatar (`AG` block) →
  UserPanel popover → ThemeButton (sun/moon/monitor ActionIcon) → dropdown
  自动 / 浅色 / 深色 (next-themes `setTheme`; Electron `nativeTheme.themeSource`
  is synced via `updateThemeModeHandler` IPC). There is **no** theme control in
  Settings (the `common` tab is deprecated and not in either componentMap;
  `settings/appearance` has no mode switch) and none in the Electron app menu
  sources — the UserPanel path is the only in-product toggle.
- Captured via the real UI path (avatar → ThemeButton → 浅色):
  `light-inbox-1440.png`, `light-inbox-800.png`, `light-projects-1440.png`,
  `light-projects-800.png` — verified `data-theme="light"` + light body bg
  (≈0.97 srgb) + `localStorage.theme='light'` in the same eval as each shot.
- After capture, theme restored to `dark` via the same UI path
  (verified `data-theme="dark"`, `localStorage.theme='dark'`).

## Files

- `*-{1440,1024,800}.png` / `.json` — 15 surfaces × 3 widths, dark theme.
- `light-*.png` — light-mode inbox + projects.
- `sweep.log`, `retry.log`, `finish.log`, `recap.log`, `rescue.log`, `watch.log`
  — capture provenance (races, retries, skips).
- `skipped.txt` — surfaces that could not be captured and why.
- `metrics.js`, `sweep.sh`, `retry.sh`, `finish.sh`, `recapture.sh`,
  `inbox-rescue.sh`, `watch-inbox.sh` — tooling used for this sweep.
