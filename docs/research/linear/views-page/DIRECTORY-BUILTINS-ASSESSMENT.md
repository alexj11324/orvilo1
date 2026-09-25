# Views directory virtual built-ins assessment

The inspected Linear workspace directory at `/views/issues` contains zero saved views.
The candidate directory always injects five virtual rows from
`packages/database/src/models/builtinSavedViews.ts`. Hiding them would improve the
directory screenshot, but it is not currently lossless.

| Candidate virtual view | Current query                    | Alternative reachable surface                                      | Safe to hide now?                            |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| All tasks              | workspace-readable task query    | My issues is user-scoped; Team Issues is team-scoped               | No                                           |
| Blocked                | status in failed/paused          | Can be rebuilt with view filters, but has no named route/preset    | No                                           |
| In progress            | status = running                 | Can be rebuilt with view filters, but has no named route/preset    | No                                           |
| All projects           | workspace-readable project query | `/projects` covers the same broad collection                       | Likely, after route/result equivalence proof |
| Review                 | reviewer = current user          | `/reviews` is the pull-request review product, not this task query | No                                           |

The virtual IDs also support deep links and favorites. Removing them from the list while
leaving their routes technically addressable would still remove first-time discoverability.

## Required next decision

Choose one product contract before changing the directory:

1. Retire virtual built-ins and redirect each ID to a proven equivalent work surface.
2. Move the presets into New view, so an empty directory matches Linear while the five
   definitions remain intentionally discoverable and create a user-owned saved view.
3. Keep a candidate-specific preset section and accept that the directory will not match
   the reference empty state.

Option 2 best fits the observed Linear directory/creation model, but it is a separate
creation-flow slice and needs explicit acceptance.

## Tests required before hiding rows

- Directory grouping helper: zero user-owned/shared records renders the Linear-style empty
  state; built-in definitions do not count as saved views.
- User-owned/shared records still render under their correct sections and keep direct links.
- Each virtual definition has either a tested redirect or a New-view preset that recreates
  the same `entityType`, filter, grouping, layout, and sort.
- Existing favorites for `builtin:*` resolve to an intentional migration target instead of
  a dead or undiscoverable route.
- Projects alternative route returns the same readable project scope before the Projects
  virtual row is retired.
- Review regression proves the task-review query is not accidentally redirected to the PR
  Reviews surface.
