# Project link modal: reference and acceptance

Status: partial implementation, not accepted. Captured 2026-09-22 from the
authenticated Linear project Overview using CDP 9222; candidate is Electron
CDP 9223, local Wave2 Verify Project. No reference link was submitted.

## Observed structure and geometry

- Add link to project heading with link icon; URL required; Title optional;
  Cancel and Add link. No visible corner close control.
- Light reference viewport 1600 × 1002: panel 540 × 289, x530/y237.671875,
  radius12 and 1px border. Interior padding32, usable width474.
- Reference vertical layout uses column flex spacers with growth 1:2, not a
  fixed top coordinate. Candidate at 1600 × 900 measures y203.671875.
- Inputs: 474 × 32, font13, padding6px 12px, radius8.
- Actions: height32, font13/500, padding12 inline, pill radius, gap16.
- Reference primary background: lch(53 52.26 286.91). Reference scrim was
  measured as lch(0 0 0 / .25) at opacity .95.
- Empty URL primary is enabled on reference; submitting an empty form has
  not been exercised on reference. Do not infer its validation UI.

## Candidate acceptance on e9801c4e patch over 608e01b9

The patch is temporarily integrated, not yet committed/pushed on the delivery
branch. Real trusted clicks opened the menu and dialog, canceled it, and reopened
it without an error boundary. The panel and input dimensions and vertical flex
position above were confirmed in the live Electron DOM. Screenshot inspected at
`/tmp/orv130-candidate.png` (ephemeral, not a published artifact).

Remaining before acceptance:

- Re-measure reference label text itself: candidate's 16px label looks larger;
  ancestor font metrics are not sufficient evidence of text-node appearance.
- Inspect Cancel's subtle outline/inset shadow; transparent border alone does
  not describe the full reference treatment.
- Confirm focus ring, theme-aware accent, hover, accessible dialog title,
  short viewport scrolling and narrow layout.
- Verify empty-submit blocking and dismissal without creating any local row.

## Follow-up evidence and corrections

- Reference label container is 16px/24px, but URL and Title child spans are
  13px/500/normal; optional is 12px/450/normal. The implementation now preserves
  container geometry and styles the actual text spans separately (en/zh keys).
- Cancel's outline originates in its `::after` shadow, not its transparent
  border. Candidate now uses the theme hairline token as an outline shadow;
  exact color/secondary elevation equivalence remains to verify.
- Independent review found content clipping under the modal's constrained
  height. Before correction, both actions failed hit testing at 800 × 300.
  Restored vertical content scrolling; scrolling Cancel into view now produces
  a successful hit. At 390 × 700 all four input/action controls are hittable.
  Device emulation was cleared after the probe.
- Empty local submit keeps the modal open and URL focused with native
  `valueMissing=true`; no successful-save claim follows from this check.
- Scoped lint and resource tests pass (12 cases). This does not cover all
  modal-shell states; the viewport regression above was exercised in Electron.

Overview behind this modal is a separate unaccepted surface: populated member
chips and update presentation require matching populated reference states.
Do not remove fixture members/updates to simulate those states.
