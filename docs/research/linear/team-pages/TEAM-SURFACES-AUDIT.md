# Team surfaces parity audit

## Evidence envelope

- Reference: authenticated Linear workspace `bdiverifier`, team `ORV` (`orvilo`), light theme, English locale, observed 2026-09-22.
- Reference viewports: desktop 1729×889 for all five surfaces; 768×900 for Home; 390×844 for Home, Triage, Issues, Projects, and Views. The 390px Issues board preserves horizontal columns rather than converting to a single list.
- Candidate: source and repository documents at `53c947faa` in the dirty `devin/v6-linear-polish` worktree. The shared Electron `:9222` runtime was queued, so this lane did not navigate it.
- Evidence classes: **Observed** means current Linear DOM, route, menu, or screenshot; **Source** means current candidate code; **Unknown** means the required comparable state was absent or intentionally not mutated.
- Reference screenshots were captured and visually inspected through the authenticated CUA/CDP tab in this run. They remain session-local because no publication of private captures was authorized.

## Route and issue ownership

No new Linear issue is needed. The requested surfaces already have distinct owners.

| Surface  | Linear route                                                     | Candidate route                           | Owner and dedupe                                                               |                                                                 |
| -------- | ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Home     | `/team/ORV/overview`                                             | `/teams/:teamId`                          | `ORV-145`; seed/sidebar dependency `ORV-135`                                   |                                                                 |
| Triage   | `/team/ORV/triage`                                               | `/teams/:teamId?tab=triage`               | `ORV-121`                                                                      |                                                                 |
| Issues   | `/team/ORV/active`, `/backlog`, `/all`                           | \`/teams/:teamId?tab=issues\&scope=active | backlog`; omitted `scope\` means all                                           | `ORV-146`; reuse `ORV-126` for hierarchy and `ORV-135` for seed |
| Projects | `/team/ORV/projects/all`                                         | `/teams/:teamId?tab=projects`             | `ORV-147`; reuse workspace table work from `ORV-141` and Health from `ORV-124` |                                                                 |
| Views    | `/team/ORV/views/issues`, `/views/projects`, `/views/issues/new` | `/teams/:teamId?tab=views` plus a modal   | `ORV-148`; reuse workspace Views work from `ORV-142`                           |                                                                 |

The candidate destinations are distinct from My issues (`/my-issues`, assignee/subscriber/creator scopes) and Project Issues (`/project/:slug/tasks`, project scope). `teamTaskQuery()` applies `teamId`, while Project Issues applies `projectId`; these filters must remain separate even if they share list and board components.

## Reference state and click-after contract

### Home

**Observed current state:** populated team identity and one member; empty description and Team resources. The page has a team header with favorite, actions, and copy URL; Overview/Documents/Members tabs; editable icon, name, and description; Add resources/Add section; member/add-member controls; Connect channel, Team settings, and links to the other four team surfaces.

**Click-after contract:** Home quick links land on the exact team routes in the table above. At 768px and 390px the workspace sidebar disappears behind a Menu control. The member and Go to rail moves inline above Team resources. Edit/add controls were inventoried but not exercised because they mutate Linear.

### Triage

**Observed current state:** empty. Header controls are favorite, Add filter, and Display options; the centered empty state says “Nothing to triage” with Create triage issue.

**Click-after contract:** Create triage issue opens the standard issue composer with team `ORV` and status `Triage` already selected. Closing it leaves the queue unchanged. Add filter opens Assignee, Agent, Agent Session, Creator, Priority, Labels, Relations, Suggested label, Dates, Project, Project properties, Subscribers, External source, Auto-closed, Content, Links, and Template. Display options exposes Ordering=`Added to triage`, Show snoozed, and display properties ID/Due date. At 390px the same controls remain in the header and the empty state stays centered.

**Unknown:** no populated triage items existed, so accept, snooze, assign, row menus, one-item/many-item behavior, and post-action feedback were not observed.

### Issues

**Observed current state:** populated board. The current All issues view had Backlog/Todo/In Progress/In Review/Done/Canceled columns with live counts 23/6/11/62/36/10. These are current account data, not fixture expectations.

**Click-after contract:** Active, Backlog, and All issues are distinct URLs. The page also exposes Add new view, Add filter, Display options, Open details, per-column menus/create buttons, and issue links. Add filter includes status, assignee/agent, creator, priority, labels, relations, dates, project properties, subscribers, content, and related fields. Display options exposes List/Board, grouping, ordering, completed issues, sub-issues, triage issues, empty columns, and selectable properties. At 390px the board remains horizontally scrollable with full-height narrow columns.

### Projects

**Observed current state:** populated table with three projects. The visible seven-column contract is Name, Health, Priority, Lead, Target date, Issues, Status. Header controls include New project, All projects, Add new view, Add filter, Display options, and Open sidebar.

**Click-after contract:** project names open project Overview. Sortable headers are Name, Health, Priority, Target date, and Status. Rows expose inline health/update, priority, lead, target date, issue-count, and progress/status controls; these mutating controls were not exercised. Add filter includes Status, Priority, Labels, Lead, Members, Creator, Health, Dates, Milestones, Relations, Template, Title & summary, and Specific project. Display options exposes List/Board/Timeline, grouping, ordering, closed projects, and property selection. At 390px the table preserves compact row identity and a subset of attributes while hiding/overflowing the wider columns.

### Views

**Observed current state:** both Issues and Projects directories are empty. Each shows the illustrated Views explanation, Create new view, Documentation, and Display options.

**Click-after contract:** Issues and Projects are separate URLs. Create new view navigates to `/team/ORV/views/issues/new`; it is a full-page editor, not a dialog. It defaults to “All issues”, saves to `orvilo`, offers name/description, Issues/Projects, Add filter, Display options, a live populated results preview, Cancel, and Create view. Cancel returns to `/team/ORV/views/issues` without writing. At 390px the empty illustration, explanation, and two CTAs stack vertically.

**Unknown:** no saved team view existed. Populated directory rows, saved-view permissions, save/reload, and error behavior require an authorized disposable reference fixture.

## Earliest candidate mismatches

### Shared boundary

`src/spa/router/desktopRouter.shared.tsx:839-859` registers one `/teams/:teamId` route. `src/features/HomeSidebar/Body/TeamsSection.tsx:63-70,186-220` correctly keeps five destinations and defaults joined teams open. The first shared mismatch is inside `src/features/WorkTeams/TeamPage.tsx:245-699`: one generic team header and collection shell renders all tabs, so page-specific breadcrumbs, actions, sub-tabs, toolbar controls, and narrow-screen contracts never exist.

The query-param route is acceptable if each destination keeps stable history and its own state. Do not collapse these surfaces into My issues or Project Issues to imitate Linear path names.

### Home (`ORV-145`)

- **Source:** `TeamHome.tsx:93-260` renders card-style Members, Quick links, Active cycle, Projects, and Views sections.
- **Mismatch:** Linear uses a flat editable team overview with Overview/Documents/Members, icon/name/description editing, Team resources, member/add-member, settings/channel, and responsive rail reflow. Candidate lacks those controls and adds card sections absent from the observed reference state.
- **Boundary:** extend the team overview/domain owners; do not fake documents with another resource type. Resources/Documents remain a domain question, not a styling-only task.

### Triage (`ORV-121`)

- **Source:** `TeamPage.tsx:562-595` shows a label plus empty/list body. The empty CTA calls `createTaskModal()` without `teamId`. `TeamTriageRow` exposes Accept, Decline, Duplicate, Transfer, and Reassign (`TeamPage.tsx:109-224`; `teamTriageOverflow.ts:38-52`).
- **Mismatch:** no page-level Add filter/Display options, no snoozed/ordering contract, and the create flow does not bind the current team. The reference composer starts with team ORV and Triage status. Candidate also has Decline where the tracked reference acceptance calls for snooze; populated reference evidence is still required before final row semantics are frozen.
- **Boundary:** first pass `teamId` through creation and define the local triage-status creation contract, then build filters/display and only then align populated row actions.

### Issues (`ORV-146`)

- **Source:** `teamTaskQuery()` correctly applies `teamId` and distinct All/Active/Backlog workflow predicates (`teamWorkQuery.ts:17-69`). `WorkQueryResults` provides shared list/board output (`TeamPage.tsx:666-695`).
- **Mismatch:** candidate header says only the team name; toolbar provides scope, cycle, no-project, and list/board. It lacks the observed breadcrumb/title, notification, Add new view, Add filter, full Display options, detail-pane toggle, and view persistence contract.
- **Fixture correction:** the six PMI tasks are projectless but team-owned (`linearParitySeed.ts:35-90,551-559`). Current Team Issues should therefore contain 22 tasks, while Project Issues remains 16. The 16-task text in `ORV-145`/`ORV-146` and earlier screenshots is revision-specific and stale. Bind future evidence to commit SHA and assert both counts.

### Projects (`ORV-147`)

- **Source:** the team query correctly filters projects by `teamId` (`TeamPage.tsx:307-320`), but renders `SavedViewProjectRow`, a compact status/name/identifier/time row (`TeamPage.tsx:598-621`).
- **Mismatch:** the seven-column table, column sorting, filter/display menus, new project, add view, details sidebar, inline fields, and responsive compact table are absent.
- **Reuse boundary:** workspace Projects already owns a seven-column grid and row (`src/features/Projects/List/index.tsx:46-119,178-275,276-378`). Extract a shared table presentation with a supplied team-filtered data source. Do not implement a second project table under WorkTeams.

### Views (`ORV-148`)

- **Source:** candidate lists team-owned plus workspace-shared views in one mixed list (`TeamPage.tsx:323-340,622-665`). Creation opens `NewViewModal`, a 640px dialog with at most five preview titles (`NewViewModal.tsx:38-170`).
- **Mismatch:** no Issues/Projects directory segmentation, no illustrated explanatory empty state or Documentation link, and no full-page `/new` editor with live result surface. The current modal’s state model can be reused, but its route and composition differ.
- **Unknown data rule:** the reference directory was empty, so whether workspace-shared views belong in the team directory is unresolved. Preserve candidate inclusion until a populated reference fixture proves otherwise.

## Prioritized implementation slices

1. **Freeze scope/cardinality contracts (`ORV-135`, `ORV-146`).** Add focused query/fixture assertions that Team Issues returns 22 and Project Issues returns 16. Update stale issue wording through the coordinated Linear owner; this audit did not write Linear.
2. **Build the shared team surface shell (`ORV-133/134` as coverage, surface issues as owners).** Add breadcrumb/title/action slots, stable per-surface route-state helpers, responsive Menu behavior, and toolbar slots without changing the correct team query boundaries.
3. **Fix Triage creation before visual expansion (`ORV-121`).** Bind `teamId` and triage status, add an untriaged fixture, then implement filter/display/snooze contracts against a populated reference state.
4. **Reuse the workspace Projects table (`ORV-141`/`ORV-124` → `ORV-147`).** Feed the existing seven-column presentation with the team-filtered query; add team-specific header/actions and narrow-screen coverage.
5. **Complete Team Issues chrome (`ORV-146`).** Keep `teamTaskQuery` and shared `WorkQueryResults`; add full filters/display options, details pane, saved-view entry, route-state persistence, and exact All/Active/Backlog transitions.
6. **Move Team Views to routed directory/editor composition (`ORV-142` → `ORV-148`).** Reuse the existing view definition/query state, add Issues/Projects segmentation, full result preview, Cancel/back behavior, and empty/populated/error states.
7. **Implement Home in two bounded parts (`ORV-145`).** First identity/members/quick links/responsive layout; then real Team resources/Documents only after the domain and permissions contract is established.

Slices 3–7 can proceed independently after slices 1–2, but ORV-147 must consume ORV-141’s shared table and ORV-148 must consume ORV-142’s shared view editor to avoid duplicate implementations.

## Evidence limits and acceptance gates

- Candidate runtime behavior, computed styles, and screenshots were not inspected because the shared Electron slot was explicitly unavailable. Source findings are not runtime acceptance.
- Reference Triage was empty; populated row behavior remains unknown.
- Reference Views directory was empty; the new-view editor preview is not proof of a saved team view.
- Loading and error states were not induced on Linear. Candidate `teamSurfaceState()` correctly distinguishes error/loading/empty in source, but visual parity is unverified.
- Only Home was checked at 768px. All five were checked at 390px; desktop was checked for all five.
- Mutating controls (create/save/edit/sort defaults, inline project properties, membership/resources) were inventoried but not submitted. Full acceptance requires authorized disposable fixtures, save → reload, permissions, and failure recovery.
- Reference counts and current workspace data can drift. Every screenshot and cardinality claim used for acceptance must record reference time, candidate SHA, viewport, role, and fixture IDs.
