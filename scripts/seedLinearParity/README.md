# Linear parity fixture seed

This command creates or repairs the synthetic local fixture used by the Linear parity checks:

- workspace: the explicit `ORVILO_PARITY_WORKSPACE_ID`, or the only workspace owned by the seeded test user;
- team: `PARITY` / `Parity Test Team`, with the test user as lead and joined member;
- project: `parity-test-project` / `PTP`, with four synthetic milestones;
- tasks: 16 completed `PTP-1` through `PTP-16` rows, grouped across milestones as 2 / 7 / 3 / 4.
- My issues: six projectless `PMI-1` through `PMI-6` rows assigned to the synthetic user,
  covering urgent, blocking, ordinary, completed, and parent-child states.

The `PMI-*` rows remain owned by `Parity Test Team`, because My issues is a personal view over
real team work. Team Issues therefore contains 22 rows after this seed: 16 completed `PTP-*`
project tasks plus six `PMI-*` tasks. Project Overview still counts only the 16 milestone-linked
`PTP-*` tasks across its four milestones. Created in My issues also contains all 22 rows because
the synthetic user authored both fixture sets.

First seed the synthetic auth user with:

```bash
./.agents/acceptance/scripts/init-dev-env.sh seed-user
```

Then run the fixture seed only against the intended local database. The explicit target guard is required:

```bash
ORVILO_PARITY_SEED_TARGET=local \
  ORVILO_PARITY_WORKSPACE_ID=GQyFjgmp3ci2UW5k \
  bun run workflow:seed-linear-parity
```

The workspace id may be omitted when the seeded user owns exactly one workspace. Re-running the command repairs the team membership, workflow references, project-team link, task team/state references, and milestone links without duplicating fixture rows. It refuses a project slug or identifier owned by another user and leaves unrelated workspace rows untouched.

## Volume layer (`seedParityVolume.ts`)

`workflow:seed-linear-parity` also runs the volume seed after the base fixture, so the
populated-state surfaces have enough material to verify:

- second team `SHIP` / `Parity Shipping` with its own seven workflow states;
- one `PARITY` team cycle (`parity-volume-cycle-42`, two-week window around now);
- four additional projects — `APX` Apollo Platform (active), `VYG` Voyager Launch (planned,
  second team), `MRC` Mercury Migration (paused, at-risk), `ORB` Orbital Archive (canceled) —
  each with `startDate`/`targetDate`, a lead, milestones, labels, members, a team link and a
  dependency edge (`PTP → APX`, `VYG → APX`, `APX → MRC`, `APX → ORB`);
- 38 volume tasks (`taskpv0001`–`taskpv0038`) across all workflow categories, including
  multi-level sub-issue trees (`APX-3 → APX-4 → APX-5`, `MRC-1 → MRC-2 → MRC-3`), four
  untriaged `PARITY-*` triage items, three paused review tasks, an urgent task, a blocked
  pair, a failed run, and canceled rows — plus task dependencies, comments, activity-feed
  rows, and three `taskSubscriptions` for the fixture user;
- four pending `actionApprovals` (two `task_review` rows targeting seeded tasks, two
  `pull_request_review` rows with GitHub PR targets) that populate the Reviews surface —
  the PR rows are also linked on the Apollo overview via `project_links`;
- three saved views (workspace board, private urgent list, project portfolio board) and
  four sidebar `navigation_favorites`;
- five extra inbox notifications under the `linear-parity-volume:` dedupe prefix (one live
  action card pointing at `pv-approval-task-1`, one mention, three activity updates).

All volume rows use deterministic ids (`taskpvNNNN`, `pv-approval-*`, `svparityvolNNNN`,
the `20000000-…` uuid block) so re-running repairs in place and never duplicates. Standalone
runs are possible with `bun scripts/seedLinearParity/seedParityVolume.ts` under the same
`ORVILO_PARITY_SEED_TARGET=local` guard; the URL assertion accepts both `postgres://` and
`postgresql://` schemes for `localhost:5432/orvilo_linear_parity_20260922`.
