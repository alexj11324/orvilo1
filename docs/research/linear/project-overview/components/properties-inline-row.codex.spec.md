# Main inline Properties — corrective evidence, 2026-09-22

Owner: `src/features/Projects/Workspace/index.tsx` (not ProjectDashboard, which owns milestones). Related issue: ORV-129. Baseline `a97d07cfe`. This is an evidence-backed next slice, not an accepted implementation.

## Evidence and topology

Reference: normal Brave profile via connector CDP, repository-slimming project Overview. Candidate: actual Electron CDP 9222, parity-test-project. Full reference control inventory is retained in `../reference-inventory.md`; the user's current full-window candidate screenshot independently identifies the main row. Fresh CDP reads below supersede old radius/visibility guesses. Private reference text must not enter seed data.

Observed reference main row order: status, priority, lead, start/target date pair, team, overflow control. Candidate additionally renders inline members and Public; membership functionality also exists in the rail. Do not equate the main row and rail or certify one from evidence of the other. Unobserved overflow/team write behavior remains a separate gap.

## Measured visual contract

At 1440×900, stable reference main row x384.9766, y310, width555.5234, height28; wrap enabled, row-gap2px/column-gap4px. Vertical position depends on preceding content. Widths below describe the reference English strings, not translated-text constants.

- Status: button 106.2734×28, radius9999px, padding3px6px, In Progress label. Actual text spans must be measured separately from the native button font fallback.
- Priority: button64.8281×28, radius9999px, padding3px6px, glyph+High.
- Lead: button66.5313×28, radius9999px, padding3px6px, glyph+Lead.
- Dates: OUTER role=button DIV radius8px; INNER painted chip radius9999px, height28,padding3px6px. This outer/inner distinction is required in the probe.
- Start date icon16×16 (two paths), target date icon16×16. Text13px/500; icon-to-text distance8px; date trigger uses content width (88.3672 and106.6172 on reference), not fixed120px. A16px arrow separates the pair.
- Reference source font Inter Variable. Reuse the existing licensed font and scoped theme owner.
- Fresh narrow-width reads waited for three identical samples: at768, property row552.5234×28; at390,row256×88, still wrap with2px/4px gaps; chips remain28px. At1440 after settling, the baseline returns exactly.

## Behavior contract

Observed: clicking MAIN In Progress opens Change status menu (Backlog, Planned, In Progress selected, Completed, Canceled). Clicking MAIN start date opens date input, Day/Month/Quarter/Half-year/Year precision tabs and calendar. Reference data was not modified. The candidate currently uses a static status Tag; ProjectDateField explicitly sets suffixIcon=null.

Fix the main status trigger using the real project status service, preserving permission and lifecycle checks. Do not silently make terminal statuses writable by bypassing completion gates; record any remaining lifecycle difference explicitly. Use real button semantics and pending/error feedback. A menu rendered only in the rail is not completion.

Give the actual MAIN status/priority/lead/date controls pill geometry and icons. Keep the rail's separate layout contract. Preserve legitimate member and project functionality; moving/removing extra main-row content must follow the complete reference inventory rather than isolated geometry.

## Verification

1. Regression fails before implementation: MAIN status button missing; after fix, mouse/keyboard opens menu and selection calls the actual update path, refreshed label reflects returned state. Do not keep a DropdownMenu test mock that simply discards all menu behavior.
2. Candidate fixture: choose a writable status, read back from API, reload and verify; restore fixture state. Verify failure feedback without claiming a toast proves persistence.
3. Check dates with filled and empty values, icons, popup open, precision and saved readback. Capture pill's own shape as well as wrapper shape.
4. Updated snapshot/pair probe must flag missing icon, dead tag, wrong radius, font and spacing against known positive/negative controls; static onclick is never behavior proof.
5. Repeat real main row at1440,768,390 and forced-scroll height; compare full page, not only a crop. Record independent review and exact revision before acceptance.

## Existing evidence failure

Old `overview-verification.md` paired only the MAIN Properties heading; property controls in its pass table were rail controls. It explicitly had not tested clicks. `candidate-inventory.md` already described the static20px Tag and radius8/radius6 controls, while the inline-row spec's acceptance omitted the actual clicks. Both coverage selection and collector/report limitations require correction.
