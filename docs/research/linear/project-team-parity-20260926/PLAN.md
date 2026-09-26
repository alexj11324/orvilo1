# Project and team parity plan (2026-09-26)

## Acceptance

Compare the live Linear reference with the authenticated Electron build of this
branch, in English, light theme and the same 1440 × 900 CSS viewport. Inspect
each visible element and its interaction states with screenshots and measured
bounds. Keep screenshots of the private Linear workspace local; publish only
Orvilo captures. Use the populated local parity fixture for candidate data.

Success requires a two-way inventory for each page, no unexplained missing or
extra controls, and real click/readback checks for implemented behaviors.
User instruction: the main left sidebar starts open and cannot be collapsed;
team-group accordions remain independent. This is an explicit difference from
Linear where applicable.

Failure conditions: treating a loading frame as an empty page, comparing
different content as if it proved equal data semantics, clicking an unexpected
CDP target, adding a resource control without a real destination and permission
model, or pushing UI changes before local Electron visual acceptance.

## Page inventory and ownership

| Surface            | Linear route pattern             | Electron route pattern                          | Existing owner                                                          |
| ------------------ | -------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Team overview      | `/team/:teamKey/overview`        | `/:workspaceSlug/teams/:teamId`                 | `src/features/WorkTeams/TeamHome.tsx`, `home/TeamHomeOverview.tsx`      |
| Workspace projects | `/projects/all`                  | `/:workspaceSlug/projects`                      | `src/features/Projects/List/index.tsx`                                  |
| Team projects      | `/team/:teamKey/projects/all`    | `/:workspaceSlug/teams/:teamId?tab=projects`    | `src/features/WorkTeams/TeamProjectsSurface.tsx`                        |
| Project overview   | `/project/:projectSlug/overview` | `/:workspaceSlug/project/:projectSlug/overview` | `src/features/Projects/Workspace/*`                                     |
| Main sidebar       | Shared by all four pages         | Shared by all four pages                        | `src/features/NavPanel`, `src/features/HomeSidebar`, `src/store/global` |

Reference and candidate screenshots from the first pass are local only:
`/private/tmp/linear-team-overview-reference.png`,
`/private/tmp/linear-workspace-projects-reference.png`,
`/private/tmp/linear-team-projects-reference.png`,
`/private/tmp/linear-project-detail-reference.png`, and matching
`/private/tmp/orvilo-*-baseline.png` captures. The reference workspace and
candidate fixture contain different projects; row counts and descriptions are
recorded as data-state limits, not parity verdicts.

## Work order

1. Inventory screenshots, ARIA names, layout bounds, typography and read-only
   controls on team overview, workspace/team project lists and project detail.
2. Write measured component specs and fix the first complete page slice. Keep
   shared sidebar behavior as a separate concern in this stacked branch.
3. Implement missing real team resources only after the document visibility
   contract is settled. Public/private team access must hold through direct
   document APIs, not only through the team resource list.
4. Run scoped tests and lint, then repeat the same routes and interactions in
   Electron at the delivered commit. Capture screenshots before any push.
5. Ask an independent reviewer to check every page/state row and the evidence.

## Current comparability limits

The reference has one team and three team projects; the local seed workspace
has two teams and four projects in the selected team. The reference project
overview has a long description and no milestones; the candidate project has
short synthetic text and four milestones. These pages can establish layout and
control topology, but not exact content-height or milestone-state parity.
