# Main sidebar always-open specification

## Overview

- Target: `src/features/NavPanel`, `src/features/HomeSidebar`,
  `src/store/global`, and the global shortcut owner.
- Candidate screenshot: `/private/tmp/orvilo-team-overview-baseline.png`.
- Reference screenshot: `/private/tmp/linear-team-overview-reference.png`
  (private, local only).
- Interaction model: permanently open main left rail. Team-group accordions
  retain their own click behavior.

## Structure and appearance

At 1440 × 900 CSS pixels, the candidate left rail is 244px wide and visible
beside the page. Keep its present width, content, item spacing, drag resize and
scrolling. The screenshot's global collapse affordance near the bottom of the
rail is removed. The team/group disclosure arrows stay because they affect
only nested navigation, not global rail visibility.

The matching Linear reference also shows an open, approximately 244px rail in
this state. The user's explicit rule overrides any Linear collapse behavior.
No new color, shadow, icon or typography is needed.

## State and behavior contract

- Fresh profile: rail starts open.
- Persisted `showLeftPanel=false` from older versions: rail opens during
  hydration and stays open; no transient collapsed frame in the boot shell.
- Calls to `toggleLeftPanel(false)` or toggle without arguments cannot close
  it. The central state owner must enforce the invariant.
- `Mod+[` does not close it; remove the advertised shortcut/action.
- Narrow viewport, Portal/Goal routes, and Electron titlebar controls cannot
  collapse it. Remove or neutralize the associated global collapse controls.
- Width resize within the existing 240–400px bounds still works and persists.
- Workspace/team/favorite accordion expansion remains user-controlled and
  persisted. Do not force open every child group.

## Existing code evidence

`status.showLeftPanel` defaults true, but persisted false is restored by
`src/store/global/initialState.ts`. `src/features/NavPanel/NavPanelDraggable.tsx`
feeds it to the main panel, auto-collapses below 960px, and exposes an expand
callback. `src/features/NavPanel/ToggleLeftPanelButton.tsx` is reused in the
sidebar, header, and Electron titlebar. `Mod+[` is registered in
`src/hooks/useHotkeys/globalScope.ts`. Portal and Goal pages also write false.
Per-team state uses `sidebarCollapsedKeys` and is unrelated.

## Verification

Write focused state/action tests that fail before the fix for persisted false
and attempted false/toggle writes. Exercise an actual Electron route after
reloading from a previously collapsed preference, hit the former control
location and `Mod+[`, and resize the viewport below 960px. Capture the rail
still visible and confirm width drag remains available. Run scoped lint/tests
and remote CI typecheck; do not run local `tsgo`.

## Responsive and unobserved states

- Desktop 1440px: 244px rail; content receives remaining width.
- Narrow 390px: requirement still says open and non-collapsible; content may
  require horizontal space/scroll. Compare in Electron and report any resulting
  content obstruction rather than silently re-enabling auto-collapse.
- Dark mode: preserve theme tokens; no new paint values.
- Permission/error state: same global rail invariant; no new permission rule.
