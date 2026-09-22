# Migration fork resolution plan — PR #209 vs canary `0188_drop_retired_capability_tables`

Status: **plan only — do not execute from this file without a fresh re-check of canary's tip.**
Written against worktree `orvilo-linear-parity`, branch `devin/v6-linear-polish`, HEAD `67f2bed84`,
`origin/canary` fetched at investigation time (contains `91b103696` which added canary's 0188).

## 1. State of the fork (verified facts)

**Merge base:** `4b37d318a` — both sides share migrations through `0187_action_approval_dispatch_binding`
(snapshot id `99a5141e-1b70-4379-8d7e-cbae370ddea8`, identical on both sides).

**Canary added exactly one migration ≥ 0188:**
`0188_drop_retired_capability_tables` (journal idx 188, `when` 1790004833709,
snapshot id `29bcefbc-0084-4780-bc82-607c544113cd`, prevId = shared 0187 id).
It drops 9 tables, all `DROP TABLE IF EXISTS ... CASCADE`:

- `agent_bot_providers`, `ai_models`, `ai_providers`
- `generation_batches`, `generation_topics`, `generations`
- `messenger_account_links`, `messenger_installations`, `system_bot_providers`

The same canary slimming chain (ORV-99–111, merge `52e48da84`, migration commit `337f04c9c`)
also deletes the matching schema files (`schemas/agentBotProvider.ts`, `aiInfra.ts`,
`generation.ts`, `messengerAccountLink.ts`, `messengerInstallation.ts`, `systemBotProvider.ts`),
their models, lambda routers, `packages/types/src/generation`, `packages/const/src/bot.ts`,
3 `idGenerator` prefixes (`generationBatches`, `generationTopics`, `generations`),
and the generation relations in `schemas/relations.ts` (~13.3k LOC under `packages/database` alone).

**Branch added eight dev-stage migrations, all branch-introduced** (zero hits on
`git log origin/canary -- <file>` for each):

| Migration | Added by commit | Objects touched |
|---|---|---|
| `0188_project_planning_fields` | `e6d00f7e8` | `projects` cols: summary, lead_user_id (FK→users), start_date, target_date |
| `0189_project_fields` | `bdd127f78` | `project_dependencies`, `project_label_bindings`, `project_labels`, `project_milestones`; `projects` cols: priority, start_date_precision, target_date_precision |
| `0190_project_updates_and_health` | `7243dd690` | `project_updates`; `projects.health` |
| `0191_project_update_kind` | `7400daae0` | `project_updates.kind` |
| `0192_user_job_title` | `ed95abc0b` | `users.job_title` |
| `0193_project_links` | `02bfc4ee3` | `project_links` |
| `0194_task_project_milestone` | `42fbd87a0` | `tasks.project_milestone_id` + idx |
| `0195_task_comment_drafts` | `c5293bc3a` | `task_comment_drafts` |

Branch journal entries to remove: idx 188–195, tags `0188_project_planning_fields` …
`0195_task_comment_drafts` (`when` 1790030419400 → 1790102909110).

**`git merge-tree --write-tree --name-only HEAD origin/canary` conflicts on exactly two paths:**

- `packages/database/migrations/meta/0188_snapshot.json` — CONFLICT (add/add)
- `packages/database/migrations/meta/_journal.json` — CONFLICT (content)

Everything else auto-merges, including `schemas/index.ts`, `docs/development/database-schema.dbml`,
`apps/server/src/routers/lambda/index.ts`, `packages/const/src/apiKeyScope.ts`, `src/libs/swr/keys.ts`.

## 2. Semantic-conflict audit (step-3 finding)

**No true semantic conflict — but one fatal trap if done wrong.**

- Our 8 SQL files reference none of the 9 dropped tables (grepped; they touch only
  `projects*`, `users`, `tasks`, `task_comment_drafts`).
- Our schema additions (`project.ts`, `projectUpdate.ts`, `projectLink.ts`,
  `taskCommentDraft.ts`, `task.ts`, `user.ts`) reference only tables that survive on canary;
  `idGenerator` keys used (`projects`, `tasks`, `briefs`, `taskComments`) still exist on canary.
- No branch-changed file imports a canary-deleted module. The only grep hits are pre-existing
  lines in `schemas/index.ts` / `lambda/index.ts` / `apiKeyScope.ts` / `setting.ts` /
  `swr/keys.ts` that canary deletes in hunks disjoint from our additions → three-way merge
  resolves them correctly (confirmed by merge-tree).
- **THE TRAP:** our tree still contains the retired schema files, and our
  `meta/0188_snapshot.json` still describes all 9 dropped tables. If anyone "fixes" this fork
  by renumbering our migrations to 0189+ instead of delete+regenerate, the generated delta vs
  canary's 0188 snapshot would **re-CREATE all 9 dropped tables** (plus restore their indexes
  and FKs) — silently reverting canary's slimming. The skill's delete-then-regenerate flow is
  mandatory here, not optional. After the rebase, verify the retired schema files are gone
  before regenerating.

## 3. Executable plan

### Preconditions

- The worktree carries other agents' uncommitted WIP (`models/project.ts`, locales,
  `src/features/*`, untracked feature files — none of them migration artifacts). A `git rebase`
  needs a clean tree: **run this in a separate clean clone/worktree of the branch, or wait for
  WIP owners to commit.** Do not stash/clean others' work.
- `git fetch origin canary` and re-run the merge-tree check; if canary gained ≥0189 entries,
  adjust numbering below.

### Step A — rebase onto canary

```bash
git rebase origin/canary        # or: merge origin/canary into the branch — resolution identical
```

Expected conflicts, in replay order:

1. `e6d00f7e8` (adds our 0188): `meta/0188_snapshot.json` (add/add) + `meta/_journal.json`.
   Resolve both **to upstream** (`git checkout --ours -- <paths>` during rebase) —
   i.e. keep canary's `0188_drop_retired_capability_tables` snapshot and journal.
   Our `0188_project_planning_fields.sql` still lands as an orphan; leave it for Step B.
2. `bdd127f78`…`c5293bc3a` (our 0189–0195): each conflicts on `meta/_journal.json` only
   (their .sql + snapshot filenames are unique → apply cleanly as orphans).
   Resolve `_journal.json` to `--ours` every time; `git rebase --continue`.

Do NOT use `git rebase -X ours` blindly — resolve the two known paths explicitly so any
unexpected new conflict surfaces instead of being silently clobbered.

Merge-equivalent alternative: `git merge origin/canary` produces the same two conflicts in one
commit — resolve both to canary's version, `git rm` the branch artifacts listed in Step B inside
the merge commit.

### Step B — delete every branch-introduced migration artifact (skill: "Rebase conflicts")

After the rebase completes, in one cleanup commit:

```bash
git rm packages/database/migrations/0188_project_planning_fields.sql \
       packages/database/migrations/0189_project_fields.sql \
       packages/database/migrations/0190_project_updates_and_health.sql \
       packages/database/migrations/0191_project_update_kind.sql \
       packages/database/migrations/0192_user_job_title.sql \
       packages/database/migrations/0193_project_links.sql \
       packages/database/migrations/0194_task_project_milestone.sql \
       packages/database/migrations/0195_task_comment_drafts.sql
git rm packages/database/migrations/meta/0189_snapshot.json \
       packages/database/migrations/meta/0190_snapshot.json \
       packages/database/migrations/meta/0191_snapshot.json \
       packages/database/migrations/meta/0192_snapshot.json \
       packages/database/migrations/meta/0193_snapshot.json \
       packages/database/migrations/meta/0194_snapshot.json \
       packages/database/migrations/meta/0195_snapshot.json
```

Keep canary's `meta/0188_snapshot.json` (id `29bcefbc-…`) — it must remain, describing the
post-drop schema. Journal check: `tail -40 meta/_journal.json` must end at
`idx 188 / tag 0188_drop_retired_capability_tables`; hand-remove any `0188_project_*`…
`0195_*` entry that survived.

### Step C — verify schema state before generating

```bash
ls packages/database/src/schemas/ | grep -E 'agentBotProvider|aiInfra|generation|messenger|systemBotProvider'
# expected: no output — canary's deletions must have landed
grep -rn "pgTable(\s*'generations'\|'ai_models'\|'ai_providers'\|'agent_bot_providers'\|messenger_installations\|messenger_account_links\|system_bot_providers\|generation_batches\|generation_topics" packages/database/src/schemas/
# expected: no live table defs (two harmless doc comments mentioning "ai_providers/ai_models
# migration 0110 lesson" may remain in workspace.ts / projectMember.ts)
```

If the retired files are still present, the rebase dropped canary's deletions — stop and redo.

### Step D — regenerate one consolidated migration (skill: "Development-stage schema changes")

Consolidate all eight dev migrations into one — none has shipped; production must not replay
intermediate draft shapes.

```bash
bun run db:generate   # = drizzle-kit generate && npm run workflow:dbml
```

Produces exactly one new migration numbered **0189** (canary max is 0188):

- `packages/database/migrations/0189_<generated_name>.sql`
- `packages/database/migrations/meta/0189_snapshot.json` — drizzle-kit sets
  `prevId` = `29bcefbc-0084-4780-bc82-607c544113cd` (canary's 0188 snapshot id) automatically;
  verify, don't hand-edit.
- `_journal.json` gains `idx 189`, fresh `when` (must be > 1790004833709 — it will be, and the
  journal-boundary CI test enforces strict monotonicity).
- `docs/development/database-schema.dbml` regenerated by `workflow:dbml`.

Then per skill Steps 2–4:

1. Rename to something meaningful, e.g. `0189_linear_parity_project_layering.sql`.
2. Update the journal `tag` to match (no `.sql`).
3. Audit the generated SQL: it must contain ONLY our objects — `projects` columns
   (summary, lead_user_id+FK, start/target date + precisions, priority, health),
   `project_dependencies`, `project_label_bindings`, `project_labels`, `project_milestones`,
   `project_updates` (final shape incl. `kind`), `project_links`, `users.job_title`,
   `tasks.project_milestone_id`, `task_comment_drafts`. **It must NOT contain
   `CREATE TABLE` for any of the 9 dropped tables** — if it does, Step C failed.
4. Harden idempotence: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS` + `ADD`, `CREATE INDEX IF NOT EXISTS`, FK references to
   surviving tables only.

### Step E — dev-database remediation (skill: dev-stage fix-up)

Dev DBs that applied old 0188–0195 must be repaired (rows in `drizzle.__drizzle_migrations`
carry `created_at` = journal `when` values 1790030419400, 1790034917561, 1790039707289,
1790053618682, 1790055037737, 1790076518129, 1790092113813, 1790102909110).

Preferred — drop the draft objects + journal rows, let 0189 replay fresh (drops dev data in
those columns; acceptable for dev DBs):

```sql
DROP TABLE IF EXISTS "task_comment_drafts", "project_links", "project_updates",
  "project_milestones", "project_label_bindings", "project_dependencies",
  "project_labels" CASCADE;
ALTER TABLE "projects"
  DROP COLUMN IF EXISTS "summary", DROP COLUMN IF EXISTS "lead_user_id",
  DROP COLUMN IF EXISTS "start_date", DROP COLUMN IF EXISTS "target_date",
  DROP COLUMN IF EXISTS "start_date_precision", DROP COLUMN IF EXISTS "target_date_precision",
  DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "health";
ALTER TABLE "users" DROP COLUMN IF EXISTS "job_title";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "project_milestone_id";
DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "created_at" IN (1790030419400, 1790034917561, 1790039707289, 1790053618682,
                         1790055037737, 1790076518129, 1790092113813, 1790102909110);
```

Run via the `access-pg` pattern: `set -a && source .env && set +a && bun -e 'import pg …'`
against DATABASE_URL.

Alternative (preserves dev data): leave objects in place and let the hardened `IF NOT EXISTS`
0189 run — it no-ops on existing shapes and records itself; then delete the eight stale
`__drizzle_migrations` rows above. Only safe if the regenerated 0189 is fully idempotent AND
the draft shape equals the final shape (0191's `kind` alteration makes this fragile — prefer
the drop path unless dev data matters).

### Step F — generated artifacts

- `docs/development/database-schema.dbml` — regenerated by `bun run db:generate`
  (`workflow:dbml`); must be committed. Auto-merges during the rebase but the regenerated
  output is authoritative (canary deleted ~230 retired-table lines; we add the project-layer
  tables).
- `packages/database/src/core/migrations.json` — **does not exist in this repo** (skill text
  is stale; verified via `git ls-files`). `src/core/` holds only `__tests__`, `db-adaptor.ts`,
  `getTestDB.ts`, `web-server.ts`. Nothing to regenerate.

## 4. Verification (CI only — no local runs)

- **Test Database** job (`.github/workflows/test.yml`, ParadeDB service,
  `pnpm --filter @orvilo/database test:coverage`) is the primary proof:
  - `src/core/__tests__/migrationJournal.test.ts` — pins journal `when` strict-monotonicity
    and a two-stage apply boundary (would catch a skipped/out-of-order 0189).
  - `src/models/__tests__/drizzleMigration.test.ts` — full migration replay from scratch.
  - `src/models/__tests__/projectMilestoneMigration.test.ts` — our milestone column coverage.
  - Plus the job's `bun run lint` step.
- **Typecheck** — catches any surviving import of a canary-deleted module.
- **Test Packages / Test Server (shards) / Test App (shards)** — router/schema regressions.
- **Required Quality Gate** — aggregate; PR #209 mergeable state must flip CONFLICTING →
  MERGEABLE once pushed.
- Read-only pre-push self-checks: `git merge-tree --write-tree --name-only HEAD origin/canary`
  → zero conflict paths; `tail` of `_journal.json` ends at idx 189 with our single tag;
  `git diff origin/canary -- packages/database/migrations/` shows exactly one added .sql +
  one added snapshot + one journal entry.
