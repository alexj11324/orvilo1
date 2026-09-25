# Runtime acceptance — e56fd439

Runtime evidence captured on the Electron dev build (`app://renderer`, CDP
`:9222`) running this worktree at `e56fd439` (the avatar fix was in the tree
via HMR before it was committed), compared against the authenticated Linear
reference `linear.app/bdiverifier` in a copied Brave profile on CDP `:9666`.
Candidate viewport 1440x900, locale zh-CN; reference 1237x908, en-US.

## Surfaces verified

| Surface | Candidate | Reference | Result |
| --- | --- | --- | --- |
| Projects list | `electron-projects-1440.png` | `linear-ref-projects.png` | Same 7 columns (Name/Health/Priority/Lead/Target date/Issues/Status), empty health copy, status + progress cells |
| Lead picker | `electron-projects-lead-popover.png` | — | Search input, "no lead" option, member list render |
| Lead persistence | `electron-projects-lead-avatar.png`, `electron-projects-lead-set.png` | — | Member avatar renders in the cell after save; persists into project overview |
| Project overview | `electron-project-overview.png`, `electron-project-overview2.png` | — | Inline properties row (status/priority/lead/members), milestones, right rail, progress |
| Team home | `electron-team-home-loaded.png` | `linear-ref-team-home.png` | Identity rail + description placeholder + members rail + quick links match Linear's layout |
| Team views directory | `electron-team-views.png` | `linear-ref-team-views.png` | Directory, entity tabs, saved views; reference captured in its empty state |
| Views sorting | `electron-views-sort-popover.png` | — | Six-option sort select; Z-A ordering verified live |
| New-view editor | `electron-views-editor.png`, `electron-views-editor-project.png` | `linear-ref-newview-editor.png` | Breadcrumb, name/description inputs, Save-to-team + Cancel + Create, entity tabs, live preview — same structure |
| View save flow | `electron-view-saved.png` | — | Create navigates to `/views/:id` with team sharing scope |
| Inbox | `electron-inbox.png`, `electron-inbox-detail.png`, `electron-inbox-rejected.png` | — | Priority/other segmentation, unread counts, master-detail card with actions, `?item=&detail=1` deep link |
| Team tabs | (verified live, no shots) | — | Issues, Triage, Projects, Views all render without regression |

## Bugs found and fixed during this pass

- Lead avatar rendered a 0x0 span after save — `TopicCreatorAvatar` resolves
  through the `useAuthorInfo` business slot, a no-op in the OSS build. Fixed in
  `e56fd439` by rendering `Avatar` from the member row.
- `proxyMatcher.test.ts` failed on the uncovered `drafts` segment and the
  fail-fast step cancelled the whole Test CI run. Fixed in `db82ef70`.

## Known gaps (not claimed as parity)

- Projects list: sorting, filtering, display options, multi-select, and the
  390px collapse are still unimplemented — the columns and lead picker match,
  the toolbar behaviors do not.
- Team home: Linear's Overview/Documents/Members sub-tabs, "Team resources"
  section, and the Go-to rail's "Connect channel"/"Team settings" entries are
  not in this slice.
- Project overview milestone rail copy reads "2 个中的 100%" vs the main
  list's "2 个议题 · 100%".
- New-view editor: Linear prefixes the name field with a layers icon; ours
  does not.
- Team views favorite affordance: Linear puts a star next to the title; we
  reuse the existing upper-right `WorkFavoriteButton`.
- Inbox reject on the synthetic notification is a no-op by design — no real
  pending decision exists, so the reconcile guard correctly skips the call.
