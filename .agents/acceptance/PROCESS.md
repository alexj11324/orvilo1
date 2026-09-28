# PROCESS.md — how a verification run works in Orvilo

This file owns the **contract and the process**: what a check is, what counts
as evidence, and how a run is planned, approved, executed, evidenced, and torn
down in this repository. [`PROJECT.md`](./PROJECT.md) owns the **commands**:
ports, services, auth, surfaces, probes.

(The portable `acceptance` skill that used to own the contract was retired with
the standalone acceptance platform — see
`docs/development/hidden-surface-retirement.md`. This file is now the whole
contract.)

Read both.

```text
PLAN (0–2)  →  EXECUTE (3–5)  →  FINISH (6)
```

Do not enter Execute until Plan has confirmed both the environment state and the
plan. Loading skills and reading logs is silent preparation — never narrate it.
The first user-visible message of a session is about the user's test, not setup.

## Phase 1 — Plan

### Step 0 — Ground the target, then read the living logs

**A test target must exist before anything else happens.** With no target in the
invocation:

1. Take it from the user's words in this conversation when they exist — the task
   lives in their words, not in git.
2. Otherwise infer the likeliest candidate from the branch, recent commits, and
   working-tree changes, and confirm it with one structured question, the guess
   labeled as a guess. Never execute against an unconfirmed guess.
3. Only when nothing is inferable, ask one direct open question.

**Once the target is known**, load both layers of both living logs — silently,
each by its own retrieval shape (the shape is defined in the generic file's
"How this file is injected"):

- **`common-mistakes.md` — the Checklist in full**: project
  [`common-mistakes.md`](./common-mistakes.md). Re-read it before marking any
  case `pass`; pull an entry by id only when its line applies.
  (There used to be a second, generic layer at
  `.agents/skills/acceptance/references/common-mistakes.md`; that skill was
  retired with the standalone acceptance platform — see
  `docs/development/hidden-surface-retirement.md`.)
- **`probe-mock-patterns.md` — index first, entries on demand**: project
  [`probe-mock-patterns.md`](./probe-mock-patterns.md). The headings are the
  index; a round needs a handful of the \~100 recipes, not all of them.

```bash
P=.agents/acceptance/probe-mock-patterns.md
rg -n '^#{2,4} ' "$P"           # the index, with line numbers
sed -n '<start>,<next-1>p' "$P" # one entry, in full — bounds from the index
```

Pick from the index by meaning, not by keyword — `rg` over the body is a
fallback for when no heading obviously matches. Reading an entry you turned out
not to need is cheap; skipping one because you searched for `dropdown` and the
heading says `slash menu` is not.

Two that keep biting: never declare a case `passed` from grep or skeleton counts
— open the screenshot with Read and confirm it rendered; and when the goal is an
error state, do not settle for happy-path because injection was hard.

**The project layer is a curated log, not a transcript of review feedback.**
Every piece of negative feedback triggers this admission check, and a candidate
passing all five is recorded automatically — no separate user request needed:

1. **Durable** — would it recur in a different feature or a later round?
2. **Project-specific** — does it depend on this product's semantics, environment,
   or infrastructure? If not, genericize it and PR it to the skill source instead.
3. **Invariant-level** — does it state the behavior or evidence contract rather
   than freezing one solution? Exact copy, pixel values, icon choices, and
   annotation coordinates belong in a spec, the component, or a regression test.
4. **Non-duplicative** — search both layers first; amend an existing case when the
   underlying failure is the same.
5. **Actionable** — can a future verifier choose a different action or reject
   invalid evidence with it? Product taste and incident narrative cannot.
6. **Mechanism-bound** — can you write its `holds-while:` line, naming the script
   default, validator gap, or platform behavior it depends on (`always` only for
   pure judgment)? An entry that cannot name its mechanism is a symptom, not a
   rule — it goes to the field notes as "cause not established".

Every admitted entry is one checklist line plus a Trap / Rule entry carrying
`since` and `holds-while`. **Exit rule:** the day a mechanism moves into a script
default or another gate — or the mechanism itself is retired — delete the entry
in the same change; do not keep it "for reference"; the field notes hold history. A rule an agent skips under
pressure (not a judgment call) goes into the table under Step 4, not the log.

A candidate that fails only for being too implementation-specific gets routed:
product behavior to the spec, UI values to the component, regressions to a test,
long incident context to `references/common-mistakes-field-notes.md` or
`references/probe-field-notes.md`. Do not skip the recording merely because it
requires abstracting the feedback first.

### Step 1 — Prepare the plan

Skip to Step 2 if this is a re-run after a fix, the plan is already agreed, or
the user gave exact commands. Skip straight to Step 5 when the delivery was
already verified on the real product earlier in this session: the run's own
observations, logs, command output, and captures are the evidence, and the
round is written from them without re-execution and without a checker stage.

Draft the surface, cases, expected evidence, assumptions, and deliverable — but
do not send it for review yet: Step 2 must establish real environment state
first, so the plan review judges one complete, evidence-backed plan.

Every case must be a delivery outcome a person can judge. Never plan the repo's
own programmatic gates (tests, coverage, type-check, lint, build) — a round of
only such checks is not verification.

### Step 2 — Environment and auth

Concrete commands come from [`PROJECT.md`](./PROJECT.md); the rules below hold
regardless.

1. **Resolve the environment first** (§2). Read ports and base URLs from the
   project's own env resolver — never a hard-coded port table. If the resolved
   values do not match a running dev server, fix the env before continuing.
2. **Dependencies** (§2, §6). A root install does not cover `apps/desktop` or
   `apps/cli`; install in each standalone app the run will touch. A stale
   standalone install fails at launch with an unresolved workspace import.
3. **Run long-lived scripts from the repo root.** Background commands inherit the
   cwd, and every path here is repo-root-relative.
4. **Start the environment** (§2), including every service the feature depends on
   — a queue, cache, or object store the code path dispatches to is a hard
   prerequisite, not a nicety. Prefer the user's already-running config; never
   clobber it.
5. **Auth, scoped to the selected surface** (§3). Inject login state directly
   (seeded session, cookie/state restore, CLI-minted token). **Never drive an
   interactive login/OAuth flow** — it hijacks the user's browser session. With no
   injectable state, report ❌ Blocked and name the exact blocking step.
6. **Screen-recording preflight, only for OS-capture surfaces.** macOS
   `screencapture`/osascript returns a fully black frame when Screen Recording
   permission is missing _or_ the display is asleep. Gate on
   `.agents/acceptance/scripts/check-screen-recording.sh` (exit 0 = safe), and keep
   the display awake for the session with `caffeinate -dimsu &`. CDP capture
   (`agent-browser screenshot`, `cdp-screenshot.sh`, `record-app-screen.sh`) is
   unaffected.

### The plan gate

At the end of Step 2, for the **first round of every Acceptance**, write the plan
feedback (format and status markers:
[`references/plan-feedback.md`](./references/plan-feedback.md)) into the round's
review notes and review it against that file's own criteria before executing. A
"ready" verdict — or its material findings resolved — is the gate; execution
starts without asking the user. Do not present the plan to the user for
confirmation.

> The separate **acceptance-checker** role, and the skill document that defined
> it (`references/acceptance-checker.md`), were retired with the standalone
> acceptance platform. The review still has to happen; it is now the author's,
> held against `references/plan-feedback.md`.

The user is asked only for a **user-owned prerequisite** (a secret, a device/2FA
approval, a permission only they can grant, a destructive action) or a product
decision that materially changes the plan: a new surface, external system, or
account; a materially changed business goal; or an environment change that
invalidates the evidence strategy. Ask with one structured question and stop.

On follow-up feedback: read the Acceptance, silently re-check environment and
auth, repair, re-run the affected checks, and run a new round. The plan review
happens on the first round only; afterwards the primary inspects its own
evidence. Code
revisions, restarts, recaptures, retries, and new rounds never involve the
user.

## Phase 2 — Execute

### Step 3 — Pick the surface

| Change scope                                   | Surface      | Why                                                 |
| ---------------------------------------------- | ------------ | --------------------------------------------------- |
| Backend (router / service / model / migration) | **CLI**      | Fastest loop, text-assertable, no UI flakiness      |
| Pure frontend (components, store, styles, UX)  | **Electron** | The primary product shape; live state introspection |
| Full-stack (new API + the UI consuming it)     | **Web**      | Network and UI observable together                  |

Launch commands per surface are in `PROJECT.md` §4. Escalate, don't duplicate:
verify a backend change with the CLI first, and add a UI pass only when the
change reaches the UI.

**Separate the driver from the evidence surface.** Producing the state under test
and capturing the evidence are independent choices. Drive with the cheapest
deterministic path the repo offers (a CLI command, an endpoint call, a seed
script — `PROJECT.md` §4/§5); use the evidence surface only for what it alone can
prove. Typing a long prompt through browser automation when a CLI driver exists is
slower, flakier, and no more authentic — the server-side state is identical. The
converse also holds: a CLI-driven state still needs UI evidence when the claim is
about rendering.

**Prove which runtime actually ran.** Several features have two execution paths and
the UI picks one silently (gateway vs heterogeneous runtime). A test that
exercises the wrong path passes green without touching the code under test. Confirm
with a server-side operation row, a queue step, or a server-only log line; if the UI
will not take the intended path, call the server endpoint directly.

### Step 4 — Run

Project scripts live in `.agents/acceptance/scripts/` and are described in
`PROJECT.md` §5. The generic capture toolchain:

| Script                      | Use                                                                 |
| --------------------------- | ------------------------------------------------------------------- |
| `report-init.sh`            | Scaffold a report directory grouped by acceptance subject           |
| `fixture.mjs`               | Per-check fixtures: `init-check`, `list`, `compose`                 |
| `record-gif.sh`             | Frame sequence → GIF for time-based behavior                        |
| `check-screen-recording.sh` | Preflight for OS capture (permission + display awake)               |
| `cdp-screenshot.sh`         | Electron/Chrome screenshot over raw CDP (bypasses the daemon)       |
| `capture-app-window.sh`     | Screenshot one app window (macOS OS capture)                        |
| `record-app-screen.sh`      | Record an app screen (CDP frames → video + gallery)                 |
| `agent-browser-klm.mjs`     | Wrap an `agent-browser` action and append its interaction-cost atom |

macOS automation patterns: [`references/osascript.md`](./references/osascript.md).
Screen recording: [`references/record-app-screen.md`](./references/record-app-screen.md).

**Interaction cost (optional, UI runs).** Drive cost-bearing actions through the
KLM wrapper so each one also records a user-equivalent atom:

```bash
TRACE="$DIR/interaction-trace.jsonl"

.agents/acceptance/scripts/agent-browser-klm.mjs \
  --klm-trace "$TRACE" --klm-phase login --klm-check case-1 \
  --session "$SESSION" click @e3

.agents/acceptance/scripts/agent-browser-klm.mjs mental \
  --klm-trace "$TRACE" --klm-phase first-view --m 2 --score 3 \
  --confidence 0.75 --reason "First view requires reading state and choosing the next action"
```

Leave the trace in the report directory: it is the record the round's interaction
cost is read from. There is no analyze step, and no cost is reported when no
trace exists.

**Rules that hold under pressure.** Not judgment calls — each excuse below was
made in a real Orvilo round.

| Excuse                                                                    | Reality                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The agent operation finished, I'll stop the dev server"                  | Verification and repair can start minutes later and still own pending operations. Keep every dependency alive until the bound Task reaches a stable terminal state or non-progress is proven. (was L-S4)                                                                                                                       |
| "No popup in the DOM 500ms after the click — the trigger is broken"       | A Chrome MCP tab is hidden: `visibilityState === 'hidden'`, rAF delivers 0 frames. Assert on state (`data-open`, the store), confirm the tab's health first, and get timing-dependent behavior confirmed in a foreground tab. A negative from a hidden tab is not evidence. (was L-S10)                                        |
| "My change has no effect — must be the Vite cache" / "the app won't open" | Another session may have stashed the whole tree (`pre-rebase2-<pr>-<sha>`) or left conflict markers. Confirm your file is in `git status` with a unique marker before and after capture; recover only your file with `git checkout stash@{n} -- <file>`; never pop or drop their stash or resolve their conflicts. (was L-S13) |
| "The fix is in and the tests are green"                                   | Reproduce the failure's precondition first (here: the empty→non-empty task-list transition swaps the composer instance). A run that cannot fail proves nothing; when the mocked seam is the suspect, drop the mock and drive the real kernel. (was L-S18, now generic M31)                                                     |

### Step 5 — Report and deliver evidence

> **Publishing to a standalone acceptance site was retired** with the platform
> (`docs/development/hidden-surface-retirement.md`, HS-01 … HS-13). There is no
> `lh acceptance run ingest`, no `lh acceptance view`, and no
> `https://orvilo.aspectlylabs.com/acceptance/<id>` URL any more. The report
> schema and the round rules that used to live in the skill's
> `references/report.md` went with it — **this section is now the whole
> contract**, so read it before writing the first line of `result.json`.
>
> Evidence for a run-scoped acceptance still goes through the retained channel:
> the in-app acceptance panel on the task detail page, and the
> `orvilo-acceptance-evidence` builtin tool (`listCriteria` / `submitEvidence`)
> for the criteria of the run you are working in. For a PR, attach the
> observations and captures to the PR itself and name the commit SHA they were
> produced on (`AGENTS.md` → Verification Evidence).

What is specific to this repository:

- **Reports live outside the repo**, under
  `${TMPDIR:-/tmp}/orvilo-acceptance/reports/<subject-key>/<timestamp>-<slug>/`
  (override with `ACCEPTANCE_REPORT_ROOT`), grouped by acceptance subject; the
  subject directory holds an `acceptance.json` marker and one subdirectory per
  immutable round. Scaffold with
  `report-init.sh --subject topic:tpc_xxx <slug> "<title>"`, which also pre-fills
  `result.json.subject`. Reports are per-run scratch — the durable copy is the
  evidence attached to the PR, or the in-app acceptance panel for a run-scoped
  acceptance — so they never touch the working tree.

- **Reusable per-check inputs** live in `.records/fixtures/<subject-key>/<check-id>/`
  (`check.json` + `seed/`). Execution outputs stay in the round's `assets/` and are
  never copied back into a fixture.

- **The subject must be an object that already exists.** Prefer, in order: an
  explicit instruction; the current conversation's `topic:<id>` (the default for
  iterative fixes and review follow-ups); an existing `task:<id>` that already
  owns the deliverable; or `document:<id>` when the document is the subject.
  Never invent a new Task just to have somewhere to attach a round. A terminal
  Acceptance on the right Topic means a **new Acceptance on that same Topic**,
  never a new Task created to dodge it.

- **Before a follow-up round**, read the current state rather than memory — from
  the in-app acceptance panel on the subject's task detail page. Omit accepted
  checks, repair non-stale rejects under their exact stable ids, and carry every
  `supersedes` chain forward.

- **The final reply carries no publish URL.** That URL is gone with the platform.
  Report what was observed and where the evidence lives; do not present local
  file paths as if they were shareable links.

## Phase 3 — Finish

### Step 6 — Teardown

Default: stop what you started. A dev server left listening or an injection left
in a source file corrupts the next run and the next agent's mental model.

- **Stop only what THIS run started**, using `PROJECT.md` §2 stop commands. Never a
  global process-name kill; never a listener you did not launch. A dev server the
  user started stays up.
- **Revert every code injection.** Restore the file and verify: `grep -rn AGENT-TEST`
  returns nothing. When you injected into a file that already had uncommitted
  changes, `git checkout --` is the WRONG revert — it wipes the branch's edits too;
  snapshot the file first and restore from the snapshot.
- **Keep the report and its evidence** until the evidence is attached to the PR
  (or submitted through the in-app acceptance panel for a run-scoped
  acceptance). It lives in the temp report root, never in the working tree.
- **Check `git status` before calling the tree clean.** Some dev servers write
  managed files on start.

Skip teardown only when the user explicitly wants the environment left running.
