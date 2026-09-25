# Systematic discovery

Finding differences by looking at screens misses most of them, and misses whole states entirely. Run these three passes on every page, in every state of its matrix, and triage the output before fixing anything.

## State matrix

Each page runs at least: default, hover (per row type), open popover/menu, empty, blocked or running, narrow window, dark theme. Add the page's own states (triage, archived, permission denied).

Many defects exist in one state only. Example: in the issue rail, the assignee and label rows were centered only while the task was running, because the disabled picker wrapped its trigger in an inline `span`, which shrank the row's `width: 100%` to its content. A default-state screenshot showed nothing.

## Pass 1: layout rules (no reference needed)

Deterministic invariants over the candidate alone. They catch classes of bugs and belong in CI once a page passes them.

| Rule                 | Violation                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| sibling-edge         | Stacked sibling rows in one container differ in left edge or width (tolerance 1px).              |
| centered-in-full-row | A row spanning ≥95% of its container starts its first visible content past 25% of the row width. |
| clipped-text         | `scrollWidth > clientWidth + 1` without `text-overflow: ellipsis`.                               |
| occlusion            | `elementFromPoint` at a control's center or inset corners lands outside the control.             |
| date-format          | Visible text matches an ISO date (`\d{4}-\d{2}-\d{2}`).                                          |
| hover-glyph          | An icon inside the hovered element disappears or fades out on hover.                             |

Implementations: `e2e/src/probes/layoutRules.ts` (the first five) and `e2e/src/probes/occlusion.ts`. If a path is missing on your branch, its PR has not landed; run the same measurement through Playwright `connectOverCDP` against the running app.

Every "0 violations" result needs a positive control: assert the number of sampled elements (for example, at least 4 rail rows), and keep a `.test.ts` that feeds the judge a constructed violation. Otherwise a selector that matched nothing reads as a pass.

## Pass 2: ARIA inventory (reference vs candidate)

1. Switch Orvilo to en-US so accessible names pair by text with Linear.
2. Take `locator.ariaSnapshot()` of the same scope on both sides, in the same state.
3. Diff by role plus normalized name (lowercased, whitespace collapsed, optional alias table): the output is the **missing in Orvilo** and **extra in Orvilo** lists.

Implementation: `e2e/src/probes/ariaInventory.ts`. Reference snapshots are Linear's data: keep them local, never commit or publish them. CI keeps only Orvilo's own baseline.

A control without an accessible name drops out of the candidate snapshot, so the diff also exposes accessibility gaps.

## Pass 3: type-scale histogram

Collect the (font-size, font-weight, ink) combination of every visible text node in scope, with counts, on both sides of the same page. Compare the distributions, not individual nodes. Extra combinations, or a missing step between heading and body ink, are the measurable form of "there is no hierarchy". Map any fix to the tokens in `linear-design`.

## Why not diff the whole DOM

An earlier collector captured every visible element on both sides and paired them automatically. It left about 1,300 reference and 700 candidate elements unpaired and 985 interactions blocked (`docs/research/linear/probe-coverage-2026-09-22.md` on the parity branch). Two apps share no DOM structure, so pairing on shape fails. Pair on semantics (role and name, or a short list of named anchors per page such as title, description body, and each rail row) and compare those anchors' geometry and styles.

## Output

One findings list per page × state, each finding with rule or dimension, selector or anchor, measured values on both sides, and severity. Show it to the user before fixing when the scope is a new page.
