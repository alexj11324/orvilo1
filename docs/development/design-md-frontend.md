# DESIGN frontend alignment

This change applies the approved DESIGN.md contract to shared theme hosts and audited frontend consumers. The three-layer model reuses the installed theme engine; `ThemeRoles` maps its resolved values into local primitive aliases. No new theme store or provider is introduced.

## Delivered scope

- App, Auth, Share and Workbench hosts emit root roles for body portals, locale fonts and local motion. Appearance-specific selectors preserve the static dark fallback before hydration. Sidebar colors inherit those roles; existing native transparency and geometry remain.
- Filled actions and badges pair their fill with readable foregrounds. State washes and text use separate roles; links and primary hover use their own paired roles. Tooltip retains the inverse foreground/background pair.
- Audited controls use input 6px, button/card 8px, overlay 12px and chip 4px radii. Popovers and dialogs use the engine elevation roles. API key creation fields and submit action use 36px; compact defaults remain 32px.
- The MCP dependency card and status text consume those roles. Project status chips use 12px text. Task row 44px, dense property 28px, measured 13/15px text and ProjectSidePanel's 11px optical inset remain.

## Verification

The standalone Electron fixture renders actual feature subtrees and shared components with read-only data hooks. It does not create API keys, run agents, install MCP tools or certify backend persistence. The before source is an immutable archive of commit `2372352ef`, based on canary `b5edbdf7`. Both sides use the same fixture, viewport, locale, appearance and data.

Final [Electron before/after comparisons](design-md-frontend/evidence/README.md), computed geometry and revision provenance are included in this branch. Verified product source: `68ebb3dbbe363599223252b1919be9df43e1aad2`. The final 21 runtime tests and 9 unit tests passed; scoped lint and normal pre-commit gates passed. Independent source review initially identified dark first-paint, badge-radius and imperative-modal motion gaps; these were corrected before the combined final review. The contrast regression fails at 2.03:1 without the state-text correction and passes the 4.5:1 threshold on plain, 10% wash and 20% hover surfaces.

Global legacy radius and default control height are intentionally not remapped across unaudited consumers. Account-portal styling is outside these four frontend hosts. A green static token guard is additional evidence; it is not proof of whole-product visual parity.

Standalone Share/Workbench imports were subsequently corrected in `3a9248e4edc5395085fd4717cd15f953abb46436`. The separate host fixture adds 2 cases (light and dark per host), with red/green computed-style evidence and supplementary screenshots in the comparison report. The original shared-component screenshots remain attributable to `68ebb3dbb`; their code is unchanged by this additional stylesheet entry fix.
