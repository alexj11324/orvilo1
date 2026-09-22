# Linear parity fixture seed

This command creates or repairs the synthetic local fixture used by the Linear parity checks:

- workspace: the explicit `ORVILO_PARITY_WORKSPACE_ID`, or the only workspace owned by the seeded test user;
- team: `PARITY` / `Parity Test Team`, with the test user as lead and joined member;
- project: `parity-test-project` / `PTP`, with four synthetic milestones;
- tasks: 16 completed `PTP-1` through `PTP-16` rows, grouped across milestones as 2 / 7 / 3 / 4.

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
