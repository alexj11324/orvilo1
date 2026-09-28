# Inbox page topology

Captured 2026-09-22 in light theme. Reference content is private and is not copied into this artifact.

## Desktop, 1440x900

1. Shared workspace navigation: `x=0`, `width=244`.
2. Main surface: rounded panel at `x=244`, `y=8`.
3. Inbox list pane: fixed `400px`, independent vertical scroll owner.
   - 44px page header with title/actions.
   - 44px tab/control row (`Priority`, `Other`, three actions).
   - Optional onboarding region.
   - Compact notification rows at about 55px each.
4. Detail pane: fills the remaining width and owns its scroll.
   - Before selection: centered Inbox illustration and unread count.
   - After selection: the list remains mounted and the detail replaces the placeholder.

The interaction model is click/keyboard-driven selection. Scrolling is independent per pane.

## Tablet and mobile

At 768px and 390px the reference hides workspace navigation and the unselected detail pane. The list fills the surface. Selection becomes a focused detail surface. The existing Orvilo mobile overlay already represents this structure and stays in scope as a preservation requirement.

## Unknown or excluded

- Priority Inbox onboarding preference semantics do not exist in Orvilo's current Inbox domain and are not fabricated.
- Linear's issue/review detail variants remain separate from Orvilo's notification/action and task detail model.
- Dark theme, destructive controls, mutation menus, and production notification projection were not exercised in the reference.
