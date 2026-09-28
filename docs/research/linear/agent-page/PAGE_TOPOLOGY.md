# Linear Agent page topology

Observed on 2026-09-22 in an authenticated, dedicated Brave tab. Reference locale was English,
light theme. Viewports inspected: 1440x900, 768x900, and 390x844.

## New chat

1. The shared workspace sidebar occupies 244 px at 1440 px. At 768 px and 390 px it is visually
   hidden and the Agent header exposes a 28 px Menu button.
2. The Agent surface fills the remaining rounded route container.
3. A 44 px header contains a `Switch agent chat` trigger labeled `New chat`.
4. A faint 336x336 brand illustration is centered in the upper-middle of the surface.
5. The composer overlaps the lower part of the illustration and is centered in the route body.
   It is 712x104 at 1440 px, 712 px wide at 768 px, and approximately 342 px wide at 390 px.
6. A shared bottom-right utility row contains `Agent` and `Chat history` controls.

An earlier same-day reference capture retained in `docs/research/linear/ref-sweep.md` and
`/tmp/refsweep/agent-late.png` shows a second, settled account state: the composer moves upward by
about 91 px and a three-card examples section appears underneath. In the dedicated tab used for
this slice, that section stayed dismissed throughout the inspection, so the centered composer is
the currently persisted state rather than proof that examples no longer exist.

The new-chat interaction model is click-driven. The title trigger and bottom history control both
open the same searchable history data in differently anchored menus. The composer uses the page's
real Agent send path.

## Populated chat

1. The same 44 px header shows the chat title, favorite switch, chat-options menu, and toolbar
   control.
2. The conversation uses a centered reading column. A user bubble is right-aligned. Agent work and
   result content is left-aligned. Tool work is collapsed behind a `Worked for …` disclosure.
3. The composer moves to the bottom of the route surface and keeps the same Skills, attachment, and
   send controls.
4. The chat-options menu contains a non-mutating copy action and a destructive delete action.

The populated interaction model is click-driven with scrollable conversation content. Opening a
history row navigates from `/agent` to `/agent/:chatSlug` and renders the persisted conversation.

## Evidence boundary

- Observed: empty and one-existing-chat states, title history menu, bottom history menu, Skills
  menu, chat-options menu, expanded work disclosure, and the footer Agent quick-chat control.
- Not exercised: sending, editing, favoriting, copying, deleting, attaching, creating a Skill, or
  any other mutation.
- Unknown: multiple-chat grouping, loading/error states, permissions, behavior with a long history
  list, and the exact persistence/trigger contract for the previously observed examples section.
