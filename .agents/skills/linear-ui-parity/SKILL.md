---
name: linear-ui-parity
description: 'Use when implementing or auditing Orvilo screens against the live Linear product: page inventory, systematic discrepancy discovery (layout rules, ARIA inventory, type scale, state matrix), two-way comparison, runtime evidence, and the independent final page review. Pair with `linear-design` for the token values themselves.'
---

# Orvilo ↔ Linear UI parity

The target is symmetric: every Linear element and behavior in the agreed surface must exist in Orvilo, and every visible Orvilo element without a Linear counterpart must be removed or folded into the matching flow. A useful Orvilo-only control is not an acceptable extra by default. Two kinds of exception stand: the intentional contract deltas documented in `linear-design` (for example Drafts and Try in the sidebar), and an explicit user exception. Record every exception's exact scope in the inventory row it affects.

`linear-design` owns the token values (surfaces, type scale, radius, spacing). This skill owns the method: how to find every difference, prove each fix, and close a page.

## 1. Establish a comparable pair

1. Enumerate the current Linear navigation, including menus, collapsed groups, and deep links. Pair every page with its Orvilo route and keep one inventory row per page × state. A historical matrix is a lead, not current proof. Keep workspace, team, project, and issue scopes distinct.
2. Record the reference and candidate URL, revision, locale, theme, viewport, and data state for every observation. Compare populated with populated and empty with empty. When the data differs, limit conclusions to what the pair can prove.
3. Run both products live. See [runtime setup](references/runtime-setup.md) for the shared Electron candidate, the signed-in reference browser, and the rules for mutating data on either side.

## 2. Discover differences systematically

Do not rely on eyeballing screens and fixing what someone happens to notice: that finds a fraction and misses whole states. For each page, run the three passes in [discovery](references/discovery.md) across the page's state matrix (default, hover, open popover/menu, empty, blocked/running, narrow, dark):

- **Layout rules** need no reference and catch classes of bugs: misaligned sibling rows, content centered in a full-width row, clipped text without ellipsis, occluded controls, ISO dates, glyphs that vanish on hover.
- **ARIA inventory** diffs the accessibility tree of reference and candidate, with Orvilo switched to en-US so names pair by text. It yields the _missing_ and _extra_ lists directly.
- **Type-scale histogram** compares the (size, weight, ink) combinations each page uses. A flat or noisy histogram is the "no hierarchy" complaint made measurable.

Whole-DOM diffing does not work: two apps share no structure, and an earlier attempt left \~1,300 reference and \~700 candidate elements unpaired. Pair on semantics (role + name, a handful of named anchors), never on DOM shape.

Before changing code, check [Linear conventions](references/linear-conventions.md). It records behaviors already verified against Linear so they are not re-derived or contradicted.

## 3. Compare in both directions

Use [the audit dimensions](references/audit-dimensions.md) for each page, its menus and detail panes, and each state. Every row × dimension gets a verdict: **matched**, **missing in Orvilo**, **extra in Orvilo**, **different**, or **unverified**. An unchecked dimension is _unverified_, never implicitly matched. Check navigation and data semantics before pixels: a same-looking row can query a different scope or write a different state.

## 4. Fix, prove, and guard

- Work in an isolated worktree on a branch per concern; stack on the PR you depend on rather than mixing concerns. Preserve other agents' changes.
- Every bug fix gets a regression test that fails before the fix. When the fix is a style or layout rule, extract the rule into a shared style module and assert its invariant in a `.test.ts`, and add or extend a layout rule so the whole class of bug is caught in CI. See [implementation pitfalls](references/implementation-pitfalls.md) for the traps that recur on this stack.
- Run the scoped `bun run check --lint --test <files>` and read the test count; full type-check belongs to CI.
- Exercise the real product path in the affected states, including click results and any write/readback. Attach reviewer-readable evidence (probe output, screenshots of Orvilo) to the PR, bound to the commit SHA. Keep the PR draft while known gaps or verification remain.

## 5. Completion gate

A page row is complete only when the current reference and candidate were compared in both directions across its state matrix, every dimension carries an evidence-backed verdict, remaining differences are fixed or covered by a recorded exception, and runtime evidence covers the delivered revision. Tests and green CI are additional gates, not substitutes.

Before claiming the whole project aligned, assign an **independent subagent** that did not implement the pages to inspect every inventory row, both directions, and the linked evidence. Give it the live routes, revisions, artifacts, and known exceptions; require a finding for any omitted page, unverified state, or unsupported claim. After fixes, the **same independent review repeats** on the affected rows against the new revision and evidence; the implementer's own rerun does not close a finding.
