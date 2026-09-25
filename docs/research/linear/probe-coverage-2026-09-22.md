# Visible-DOM probe runtime check — 2026-09-22

Collector/comparator revision: `ff8758f8e837fb653537da19eb1fad8bb74f4288`.

The new collector ran read-only on the actual Electron Project Overview at 1440 × 900: it captured 6,256 of 6,256 light-DOM elements without truncation, inventoried 757 visible elements, and created an interaction manifest for 123 visible controls. Every interaction edge is initially `not-tested`; a static snapshot therefore cannot certify click-after parity.

A strict automatic comparison with the older local Linear snapshot returned exit 1 and `complete=false`. The old reference file lacks the new `meta.coverage` and `coverageInventory` fields, so capture validation flagged it; there were 1,292 unpaired reference elements, 678 unpaired candidate elements, and 985 interaction blockers. This is a correct refusal to pass, not proof of alignment or a usable full diff. The reference must be recaptured with the same collector through the authenticated browser CDP connection, then cross-app semantic matches and actual interaction journeys must be reviewed.

Focused Node regression tests passed 14/14, including text mismatch, many-to-one explicit pair, malformed capture, missing icon path, typography/paint/geometry differences, and no-pair automatic invocation. The comparator reports `certified: false` even when its heuristic coverage is complete; iframe, shadow-root, virtualized, and conditional states require separate capture.
