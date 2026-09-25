# Linear parity — left navigation decisions

Decisions from the two-way nav audit (issue-list.md N1–N9), verified against
the live Linear workspace.

- **Create row removed** (N6): Linear's sidebar has no standalone `+`/Create
  entry — quick create lives behind the keyboard shortcut and page actions.
  The `create` sidebar key is retired like other legacy keys.
- **"Join a team" added** (N4): a row closing the Your teams section,
  deep-linking to `/teams` where unjoined public teams are discoverable.
- **Count badges** (N1): already implemented for Inbox / Reviews / Drafts
  (`extra` slot on the nav item, driven by the unread count, the for-me
  review queue and the drafts count). The audit saw none because every count
  was zero — no code change needed.
- **"Try" section** (N2): not added. Linear's Initiatives/Cycles are
  feature-enablement links for domains Orvilo does not have; a nav row with
  no product behind it would be worse than the gap.
- **"What's new" card** (N5): covered by the existing Billboard card
  (`src/features/Billboard`) — a dismissable promo card in the same
  bottom-left slot, driven by server config; nothing rendered only when no
  billboard is configured.
- **Favorites** (N8): kept — Linear's own sidebar carries the Favorites
  accordion in the same slot (confirmed live).
- **Dev toolbar** (N7): dev-only tooling, does not ship in production
  builds; kept.
- **"Show more links"** (N3) and **region/heading semantics** (N9):
  unverified/low-confidence items — left as-is pending firmer Linear
  evidence.
