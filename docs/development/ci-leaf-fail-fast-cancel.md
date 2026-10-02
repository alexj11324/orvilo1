# CI leaf fail-fast hides the real failure

When a `test.yml` leaf job fails, its trailing `Fail fast — cancel sibling
jobs` step calls `actions/runs/{run_id}/cancel`. The entire run then reports
`cancelled`: every leaf job — **including the one that actually failed** —
shows `cancelled`, and the Required Quality Gate fails on "all required jobs
cancelled". A PR-synchronize run's mirror gate then fails fast on
`owner=cancelled`, so the PR page shows a red gate with no visible error.

## Symptoms

- All leaf jobs `cancelled`, none shows `failure`.
- Gate log says only `Required jobs failed or were skipped`.
- PR gate error points at the owning push run being cancelled.

## How to find the real failure

1. List the push run's jobs ordered by `completed_at` — the earliest
   `cancelled` leaf is usually the one that failed first:

   ```bash
   gh api "repos/<owner>/<repo>/actions/runs/<push-run-id>/jobs?per_page=60" \
     --jq '.jobs[] | "\(.completed_at)\t\(.conclusion)\t\(.name)"' | sort
   ```

2. Read that job's log — the failing step and its error appear before the
   self-cancel:

   ```bash
   gh api "repos/<owner>/<repo>/actions/jobs/<job-id>/logs" \
     --allow-escape-sequences
   ```

3. The `Fail fast — cancel sibling jobs` step appears at the end of the
   failed job's log and issues the run-level cancel.

Example: a single `native-controls` violation (`native <input>` in
`src/features/**`) failed one leaf, which cancelled the whole push run; every
descendant PR then mirrored `owner=cancelled` — a repo-wide red gate caused
by one bare input on canary.

## Notes

- `fkirc/skip-duplicate-actions` is **not** the canceller here:
  `do_not_skip` keeps the push run executing, and `cancel_others` only
  applies to outdated-commit runs (default `'false'`).
- Gate mirrors evaluate the owning push run's verdict — a cancelled owner
  can never produce one, so the mirror fails closed by design.
