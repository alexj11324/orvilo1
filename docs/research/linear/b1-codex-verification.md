# B1 follow-up — 2026-09-22

Baseline: `84c01725e`, branch `devin/v6-linear-polish`. Candidate CDP `9222`, reference CDP `9333`, 1440×900 CSS pixels.

## Milestone filter

No filtering code was changed. The historical empty-list failure is **not reproduced**, not declared fixed.

On arrival the document URL contained Gate B's query parameter while the rendered board and DevDock router path had no filter. Reload synchronized the route and displayed Completed 7. The cause of the earlier empty state is unknown; this mismatch is an observation, not proof of that cause.

Real CDP Input.dispatchMouseEvent clicks then verified:

1. Overview → Gate B progress link: PTP-3 through PTP-9, exactly 7 completed tasks.
2. Clear filter: unfiltered board Done 16.
3. Overview → Gate B again with warm caches: the same 7 tasks.
4. Display options initially had Show completed & canceled enabled. Disable: zero rows, explicit “7 tasks hidden by display options”. Re-enable: the same 7 rows restored. Original setting restored.
5. Read-only project.detail confirms 16 tasks, milestone counts 2/7/3/4, all progress 100%; inspected task rows use valid completed status.

Independent source review found no completed-specific filtering defect. It identified an existing unguarded list onSuccess versus query scope as a possible race, but no current reproduction establishes it as this incident's cause. No speculative guard was added.

## Hover follow-up

Reference CDP hover: row 380×42, radius 8; See issues 104.398×24, text 12px/450, padding left 35/right 8, radius 2; **no icon**. Row and overlay background lch(96.5 0 282). The button ends before the separate 24px action menu.

Candidate after change: row 380×42; See issues 102.547×24, padding 35/8, text 12px/450, radius 2. The remaining 1.85px intrinsic text-width difference is not reported as exact parity. The missing action menu means its right edge remains 26px farther right; that deferred feature is unchanged.

Hover uses colorFillTertiary (measured 3% black), the closest existing semantic fill token. The overlay combines the same fill with colorBgContainer to cover the progress text without double-alpha darkening. This retains the previously recorded semantic-color divergence instead of claiming pixel identity.

Updated the two stale milestoneRow comments: the rail coexists with the overview and only See issues navigates; the reference glyph click was attempted but canceled by the draggable row, so its effect remains unresolved and the working local anchor remains.

## Checks

`bun run check src/features/Projects/Layout/ProjectSidePanel.tsx src/features/Projects/milestoneRow.ts`: 2 files, lint clean (one whitespace autofix), no related tests selected. No behavior logic changed; no stylesheet-source test added. Independent light review: no introduced findings. CDP screenshot inspected locally at /tmp/b1-candidate-hover.png; retained copy accompanies this report.

B1 is not complete 1:1: action menu, count-button behavior, No milestone, missing-date placeholder and the residual text/position differences remain in the existing deferred/unresolved scope. T5 remains pending.
